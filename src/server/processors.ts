import "server-only";
import { copyFile, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PDFDocument, PageSizes, degrees, PDFName, PDFArray } from "pdf-lib";
import { need, python, run, ToolError } from "./engines";
import type { Job, JobFile } from "./jobs";
import {
  anchor,
  baseName,
  drawableText,
  embedStandardFont,
  hexToRgb,
  loadPdf,
  num,
  parsePageList,
  parseRanges,
} from "./pdf-helpers";

export type Ctx = {
  job: Job;
  inputs: JobFile[];
  opts: Record<string, string>;
  extras: Record<string, JobFile>;
};
export type Output = { path: string; name: string };
type Processor = (ctx: Ctx) => Promise<Output[]>;

const outPath = (ctx: Ctx, name: string) => path.join(ctx.job.outDir, name);

async function savePdf(ctx: Ctx, doc: PDFDocument, name: string): Promise<Output> {
  const p = outPath(ctx, name);
  await writeFile(p, await doc.save());
  return { path: p, name };
}

function json<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new ToolError("The tool settings could not be read. Reload the page and try again.");
  }
}

function eachFile(fn: (ctx: Ctx, file: JobFile, i: number) => Promise<Output[]>): Processor {
  return async (ctx) => (await Promise.all(ctx.inputs.map((f, i) => fn(ctx, f, i)))).flat();
}

// ---------- Organize ----------

const merge: Processor = async (ctx) => {
  if (ctx.inputs.length < 2) throw new ToolError("Select at least 2 PDF files to merge.");
  const rotations = json<Record<string, number>>(ctx.opts.rotations, {});
  const out = await PDFDocument.create();
  for (const [i, f] of ctx.inputs.entries()) {
    const src = await loadPdf(f.path, f.name);
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const p of pages) {
      const extra = rotations[i] ?? 0;
      if (extra) p.setRotation(degrees((p.getRotation().angle + extra) % 360));
      out.addPage(p);
    }
  }
  return [await savePdf(ctx, out, "workify_merged.pdf")];
};

async function extractPages(src: PDFDocument, pageNumbers: number[]) {
  const doc = await PDFDocument.create();
  const pages = await doc.copyPages(src, pageNumbers.map((n) => n - 1));
  pages.forEach((p) => doc.addPage(p));
  return doc;
}

const split: Processor = async (ctx) => {
  const f = ctx.inputs[0];
  const src = await loadPdf(f.path, f.name);
  const total = src.getPageCount();
  const stem = baseName(f.name);
  const mode = ctx.opts.mode ?? "custom";
  const merged = ctx.opts.mergeOutput === "true";
  let groups: number[][] = [];

  if (mode === "custom") {
    groups = parseRanges(ctx.opts.ranges ?? "", total).map(([a, b]) =>
      Array.from({ length: b - a + 1 }, (_, i) => a + i),
    );
  } else if (mode === "fixed") {
    const n = Math.max(1, Math.floor(Number(ctx.opts.every) || 1));
    for (let p = 1; p <= total; p += n) {
      groups.push(Array.from({ length: Math.min(n, total - p + 1) }, (_, i) => p + i));
    }
  } else if (mode === "all") {
    groups = Array.from({ length: total }, (_, i) => [i + 1]);
  } else if (mode === "select") {
    groups = parsePageList(ctx.opts.pages ?? "", total).map((p) => [p]);
  } else if (mode === "size") {
    return splitBySize(ctx, src, stem);
  }

  if (merged) {
    return [await savePdf(ctx, await extractPages(src, groups.flat()), `${stem}_extracted.pdf`)];
  }
  const outputs: Output[] = [];
  for (const g of groups) {
    const label = g.length === 1 ? `${g[0]}` : `${g[0]}-${g[g.length - 1]}`;
    outputs.push(await savePdf(ctx, await extractPages(src, g), `${stem}_${label}.pdf`));
  }
  return outputs;
};

async function splitBySize(ctx: Ctx, src: PDFDocument, stem: string): Promise<Output[]> {
  const maxBytes = Math.max(0.1, Number(ctx.opts.maxMb) || 5) * 1024 * 1024;
  const total = src.getPageCount();
  const outputs: Output[] = [];
  let start = 1;
  while (start <= total) {
    // Grow the chunk page by page until adding one more would exceed the limit.
    let end = start;
    let best = await (await extractPages(src, [start])).save();
    while (end < total) {
      const next = await (await extractPages(src, range(start, end + 1))).save();
      if (next.byteLength > maxBytes) break;
      best = next;
      end++;
    }
    const name = `${stem}_${start}-${end}.pdf`;
    await writeFile(outPath(ctx, name), best);
    outputs.push({ path: outPath(ctx, name), name });
    start = end + 1;
  }
  return outputs;
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

type OrganizeItem = { file: number; page: number; rotate?: number } | { blank: true; width?: number; height?: number };

const organize: Processor = async (ctx) => {
  const items = json<OrganizeItem[]>(ctx.opts.pages, []);
  if (!items.length) throw new ToolError("Your document has no pages left. Add at least one page.");
  const sources = await Promise.all(ctx.inputs.map((f) => loadPdf(f.path, f.name)));
  const out = await PDFDocument.create();
  for (const it of items) {
    if ("blank" in it) {
      out.addPage([it.width ?? PageSizes.A4[0], it.height ?? PageSizes.A4[1]]);
      continue;
    }
    const src = sources[it.file];
    if (!src || it.page < 1 || it.page > src.getPageCount()) continue;
    const [p] = await out.copyPages(src, [it.page - 1]);
    if (it.rotate) p.setRotation(degrees((p.getRotation().angle + it.rotate) % 360));
    out.addPage(p);
  }
  return [await savePdf(ctx, out, `${baseName(ctx.inputs[0].name)}_organized.pdf`)];
};

// ---------- Optimize ----------

const GS_LEVEL: Record<string, string> = { extreme: "/screen", recommended: "/ebook", less: "/printer" };

const compress = eachFile(async (ctx, f) => {
  const gs = need("ghostscript");
  const name = `${baseName(f.name)}_compressed.pdf`;
  const target = outPath(ctx, name);
  await run(gs, [
    "-sDEVICE=pdfwrite",
    "-dCompatibilityLevel=1.5",
    `-dPDFSETTINGS=${GS_LEVEL[ctx.opts.level] ?? "/ebook"}`,
    "-dDetectDuplicateImages=true",
    "-dNOPAUSE",
    "-dBATCH",
    "-dQUIET",
    "-dSAFER",
    `-sOutputFile=${target}`,
    f.path,
  ]);
  // Never hand back a bigger file than the user uploaded.
  if ((await stat(target)).size >= (await stat(f.path)).size) await copyFile(f.path, target);
  return [{ path: target, name }];
});

const repair = eachFile(async (ctx, f) => {
  const name = `${baseName(f.name)}_repaired.pdf`;
  const target = outPath(ctx, name);
  try {
    // qpdf exit code 3 means "fixed with warnings", which is a success here.
    await run(need("qpdf"), ["--warning-exit-0", f.path, target]);
  } catch {
    await python("repair", [f.path, target]);
  }
  return [{ path: target, name }];
});

const ocr = eachFile(async (ctx, f) => {
  const name = `${baseName(f.name)}_ocr.pdf`;
  const lang = /^[a-z_+]{3,40}$/.test(ctx.opts.language ?? "") ? ctx.opts.language : "eng";
  await python("ocr", [f.path, outPath(ctx, name), lang], 900_000);
  return [{ path: outPath(ctx, name), name }];
});

// ---------- Convert ----------

function pythonConvert(command: string, ext: string, suffix = "") {
  return eachFile(async (ctx, f) => {
    const name = `${baseName(f.name)}${suffix}.${ext}`;
    await python(command, [f.path, outPath(ctx, name)], 600_000);
    return [{ path: outPath(ctx, name), name }];
  });
}

// LibreOffice initialises a user profile on first use (~10 s). Reusing one
// profile makes later conversions fast, but a profile allows only one running
// instance, so conversions are queued one after another.
const LO_PROFILE = pathToFileURL(path.join(os.tmpdir(), "workify-lo-profile")).href;
let loQueue: Promise<unknown> = Promise.resolve();
function withLibreOffice<T>(fn: () => Promise<T>): Promise<T> {
  const next = loQueue.then(fn, fn);
  loQueue = next.catch(() => {});
  return next;
}

const officeToPdf = eachFile(async (ctx, f) => {
  const soffice = need("soffice");
  const work = await mkdtemp(path.join(ctx.job.dir, "lo-"));
  const src = path.join(work, f.name);
  await copyFile(f.path, src);
  await withLibreOffice(() =>
    run(
      soffice,
      [`-env:UserInstallation=${LO_PROFILE}`, "--headless", "--norestore", "--convert-to", "pdf", "--outdir", work, src],
      { timeoutMs: 240_000 },
    ),
  );
  const pdf = (await readdir(work)).find((n) => n.toLowerCase().endsWith(".pdf"));
  if (!pdf) throw new ToolError(`"${f.name}" could not be converted. Is the file valid?`);
  const name = `${baseName(f.name)}.pdf`;
  await copyFile(path.join(work, pdf), outPath(ctx, name));
  return [{ path: outPath(ctx, name), name }];
});

const pdfToJpg = eachFile(async (ctx, f) => {
  const stem = baseName(f.name);
  const res =
    ctx.opts.mode === "extract"
      ? await python("extract-images", [f.path, ctx.job.outDir, stem])
      : await python("pdf2jpg", [f.path, ctx.job.outDir, ctx.opts.quality === "high" ? "300" : "150", stem]);
  return (res.files as string[]).map((n) => ({ path: outPath(ctx, n), name: n }));
});

const MARGINS: Record<string, number> = { none: 0, small: 20, big: 50 };

/** Images arrive as JPEG: the browser re-encodes them so EXIF rotation is applied. */
const imagesToPdf: Processor = async (ctx) => {
  const size = ctx.opts.size ?? "fit";
  const landscape = ctx.opts.orientation === "landscape";
  const margin = MARGINS[ctx.opts.margin ?? "none"] ?? 0;
  const mergeAll = ctx.opts.merge !== "false";

  const addImage = async (doc: PDFDocument, f: JobFile) => {
    const bytes = await readFile(f.path);
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
    let img;
    try {
      img = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    } catch {
      throw new ToolError(`"${f.name}" is not a supported image.`);
    }
    let [pw, ph] =
      size === "a4" ? PageSizes.A4 : size === "letter" ? PageSizes.Letter : [img.width + margin * 2, img.height + margin * 2];
    if (size !== "fit" && landscape) [pw, ph] = [ph, pw];
    const page = doc.addPage([pw, ph]);
    const scale = Math.min((pw - margin * 2) / img.width, (ph - margin * 2) / img.height, size === "fit" ? 1 : Infinity);
    const w = img.width * scale;
    const h = img.height * scale;
    page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
  };

  if (mergeAll) {
    const doc = await PDFDocument.create();
    for (const f of ctx.inputs) await addImage(doc, f);
    return [await savePdf(ctx, doc, ctx.inputs.length === 1 ? `${baseName(ctx.inputs[0].name)}.pdf` : "workify_images.pdf")];
  }
  const outputs: Output[] = [];
  for (const f of ctx.inputs) {
    const doc = await PDFDocument.create();
    await addImage(doc, f);
    outputs.push(await savePdf(ctx, doc, `${baseName(f.name)}.pdf`));
  }
  return outputs;
};

const pdfToPdfa = eachFile(async (ctx, f) => {
  const gs = need("ghostscript");
  const level = ["1", "2", "3"].includes(ctx.opts.conformance) ? ctx.opts.conformance : "2";
  const name = `${baseName(f.name)}_pdfa.pdf`;
  await run(gs, [
    `-dPDFA=${level}`,
    "-dPDFACompatibilityPolicy=1",
    "-sColorConversionStrategy=RGB",
    "-sDEVICE=pdfwrite",
    "-dNOPAUSE",
    "-dBATCH",
    "-dQUIET",
    "-dSAFER",
    `-sOutputFile=${outPath(ctx, name)}`,
    f.path,
  ]);
  return [{ path: outPath(ctx, name), name }];
});

// ---------- Edit ----------

const watermark = eachFile(async (ctx, f) => {
  const doc = await loadPdf(f.path, f.name);
  const o = ctx.opts;
  const opacity = Math.min(1, Math.max(0.05, Number(o.opacity) || 0.5));
  const rotation = Number(o.rotation) || 0;
  const below = o.layer === "below";
  const pages = parsePageList(o.pages ?? "all", doc.getPageCount());

  let draw: (page: ReturnType<PDFDocument["getPage"]>, x: number, y: number) => void;
  let boxW: number;
  let boxH: number;

  if (o.kind === "image") {
    const img = ctx.extras.image;
    if (!img) throw new ToolError("Choose an image for the watermark.");
    const bytes = await readFile(img.path);
    const embedded = bytes[0] === 0x89 ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    const first = doc.getPage(0).getSize();
    const scale = Math.min(1, (first.width * 0.4) / embedded.width);
    boxW = embedded.width * scale;
    boxH = embedded.height * scale;
    draw = (page, x, y) =>
      page.drawImage(embedded, { x, y, width: boxW, height: boxH, opacity, rotate: degrees(rotation) });
  } else {
    const font = await embedStandardFont(doc, o.font, o.bold === "true");
    const text = drawableText(font, (o.text ?? "").trim().slice(0, 200));
    if (!text) throw new ToolError("Type the watermark text.");
    const size = Math.min(300, Math.max(6, Number(o.fontSize) || 48));
    boxW = font.widthOfTextAtSize(text, size);
    boxH = font.heightAtSize(size);
    const color = hexToRgb(o.color ?? "#e5322d");
    draw = (page, x, y) => page.drawText(text, { x, y, size, font, color, opacity, rotate: degrees(rotation) });
  }

  for (const n of pages) {
    const page = doc.getPage(n - 1);
    const { width, height } = page.getSize();
    const before = contentCount(page);
    if (o.mosaic === "true") {
      // Grow the spacing on huge pages so one page never gets thousands of stamps.
      const stepX = Math.max(boxW + 60, width / 20);
      const stepY = Math.max(boxH + 80, height / 25);
      for (let y = 20; y < height; y += stepY) for (let x = 20; x < width; x += stepX) draw(page, x, y);
    } else {
      const { x, y } = anchor(o.position ?? "mc", width, height, boxW, boxH, 30);
      draw(page, x, y);
    }
    if (below) moveNewContentToBack(page, before);
  }
  const name = `${baseName(f.name)}_watermarked.pdf`;
  return [await savePdf(ctx, doc, name)];
});

function contentCount(page: ReturnType<PDFDocument["getPage"]>) {
  const c = page.node.Contents();
  return c instanceof PDFArray ? c.size() : c ? 1 : 0;
}

/** Moves content streams added after `before` to the front, so they paint underneath. */
function moveNewContentToBack(page: ReturnType<PDFDocument["getPage"]>, before: number) {
  const contents = page.node.Contents();
  if (!(contents instanceof PDFArray)) return;
  const all = contents.asArray();
  // pdf-lib may wrap the original content in q/Q streams; keep relative order of the rest.
  const added = all.slice(before);
  const original = all.slice(0, before);
  const arr = page.doc.context.obj([...added, ...original]);
  page.node.set(PDFName.of("Contents"), arr);
}

const MARGIN_PTS: Record<string, number> = { small: 18, recommended: 30, big: 50 };

const pageNumbers = eachFile(async (ctx, f) => {
  const doc = await loadPdf(f.path, f.name);
  const o = ctx.opts;
  const total = doc.getPageCount();
  const from = Math.max(1, Number(o.fromPage) || 1);
  const to = Math.min(total, Number(o.toPage) || total);
  const first = Math.round(num(o.firstNumber, 0, 1_000_000, 1));
  const font = await embedStandardFont(doc, o.font);
  const format = drawableText(font, (o.format === "custom" ? (o.customFormat ?? "{n}") : (o.format ?? "{n}")).slice(0, 100));
  const size = Math.min(72, Math.max(6, Number(o.fontSize) || 12));
  const color = hexToRgb(o.color ?? "#000000");
  const margin = MARGIN_PTS[o.margin] ?? 30;
  const lastNumber = first + (to - from);

  for (let p = from; p <= to; p++) {
    const page = doc.getPage(p - 1);
    const { width, height } = page.getSize();
    const n = first + (p - from);
    const text = format.replaceAll("{n}", String(n)).replaceAll("{p}", String(lastNumber));
    let pos = o.position ?? "bc";
    // Facing pages: even pages mirror left/right like a printed book.
    if (o.pageMode === "facing" && p % 2 === 0) pos = pos[0] + ({ l: "r", r: "l" }[pos[1]] ?? pos[1]);
    const w = font.widthOfTextAtSize(text, size);
    const { x, y } = anchor(pos, width, height, w, font.heightAtSize(size), margin);
    page.drawText(text, { x, y, size, font, color });
  }
  return [await savePdf(ctx, doc, `${baseName(f.name)}_numbered.pdf`)];
});

type RotateSpec = Record<string, { all?: number; pages?: Record<string, number> }>;

const rotate: Processor = async (ctx) => {
  const spec = json<RotateSpec>(ctx.opts.rotations, {});
  const outputs: Output[] = [];
  for (const [i, f] of ctx.inputs.entries()) {
    const doc = await loadPdf(f.path, f.name);
    const s = spec[i] ?? {};
    doc.getPages().forEach((p, idx) => {
      const extra = (s.all ?? 0) + (s.pages?.[idx + 1] ?? 0);
      if (extra % 360) p.setRotation(degrees((((p.getRotation().angle + extra) % 360) + 360) % 360));
    });
    outputs.push(await savePdf(ctx, doc, `${baseName(f.name)}_rotated.pdf`));
  }
  return outputs;
};

const crop: Processor = async (ctx) => {
  const f = ctx.inputs[0];
  const doc = await loadPdf(f.path, f.name);
  const box = json<{ x: number; y: number; width: number; height: number } | null>(ctx.opts.box, null);
  if (!box || !(num(box.width, 0, 20000, 0) >= 5) || !(num(box.height, 0, 20000, 0) >= 5)) {
    throw new ToolError("Select the area you want to keep.");
  }
  const [x, y, w, h] = [num(box.x, -20000, 20000, 0), num(box.y, -20000, 20000, 0), num(box.width, 5, 20000, 5), num(box.height, 5, 20000, 5)];
  const total = doc.getPageCount();
  const targets = ctx.opts.apply === "current" ? [Math.round(num(ctx.opts.page, 1, total, 1))] : range(1, total);
  for (const n of targets) {
    const page = doc.getPage(n - 1);
    page.setCropBox(x, y, w, h);
    page.setTrimBox(x, y, w, h);
  }
  return [await savePdf(ctx, doc, `${baseName(f.name)}_cropped.pdf`)];
};

// Overlays from the Edit / Sign editors, in PDF user-space points.
export type Overlay =
  | { kind: "text"; page: number; x: number; y: number; text: string; size: number; color: string; font: string; bold?: boolean }
  | { kind: "rect" | "ellipse"; page: number; x: number; y: number; w: number; h: number; stroke: string; fill?: string | null; strokeWidth: number }
  | { kind: "line"; page: number; x1: number; y1: number; x2: number; y2: number; stroke: string; strokeWidth: number }
  | { kind: "path"; page: number; points: [number, number][]; stroke: string; strokeWidth: number }
  | { kind: "image"; page: number; x: number; y: number; w: number; h: number; image: string };

const MAX_OVERLAYS = 2000;
// Coordinates/sizes come from the browser, so every number is clamped to sane bounds.
const coord = (v: unknown) => num(v, -20000, 20000, 0);
const extent = (v: unknown) => num(v, 0, 20000, 0);
const stroke = (v: unknown) => num(v, 0, 50, 1);

export async function applyOverlays(ctx: Pick<Ctx, "extras">, doc: PDFDocument, overlays: Overlay[]) {
  if (!Array.isArray(overlays)) throw new ToolError("The edits could not be read.");
  if (overlays.length > MAX_OVERLAYS) throw new ToolError(`At most ${MAX_OVERLAYS} edits can be saved at once.`);
  const images = new Map<string, Awaited<ReturnType<PDFDocument["embedPng"]>>>();
  for (const ov of overlays) {
    if (!ov || typeof ov !== "object") continue;
    const page = doc.getPage(Math.round(num(ov.page, 1, doc.getPageCount(), 1)) - 1);
    switch (ov.kind) {
      case "text": {
        const font = await embedStandardFont(doc, String(ov.font), Boolean(ov.bold));
        const size = num(ov.size, 1, 300, 14);
        const text = drawableText(font, String(ov.text ?? "").slice(0, 5000));
        text.split("\n").slice(0, 500).forEach((line, i) =>
          page.drawText(line, { x: coord(ov.x), y: coord(ov.y) - i * size * 1.2, size, font, color: hexToRgb(String(ov.color)) }),
        );
        break;
      }
      case "rect":
        page.drawRectangle({
          x: coord(ov.x), y: coord(ov.y), width: extent(ov.w), height: extent(ov.h),
          borderColor: hexToRgb(String(ov.stroke)), borderWidth: stroke(ov.strokeWidth),
          color: ov.fill ? hexToRgb(String(ov.fill)) : undefined,
        });
        break;
      case "ellipse":
        page.drawEllipse({
          x: coord(ov.x) + extent(ov.w) / 2, y: coord(ov.y) + extent(ov.h) / 2, xScale: extent(ov.w) / 2, yScale: extent(ov.h) / 2,
          borderColor: hexToRgb(String(ov.stroke)), borderWidth: stroke(ov.strokeWidth),
          color: ov.fill ? hexToRgb(String(ov.fill)) : undefined,
        });
        break;
      case "line":
        page.drawLine({
          start: { x: coord(ov.x1), y: coord(ov.y1) }, end: { x: coord(ov.x2), y: coord(ov.y2) },
          color: hexToRgb(String(ov.stroke)), thickness: stroke(ov.strokeWidth), lineCap: 1,
        });
        break;
      case "path": {
        const pts = Array.isArray(ov.points) ? ov.points.slice(0, 10000) : [];
        for (let i = 1; i < pts.length; i++) {
          page.drawLine({
            start: { x: coord(pts[i - 1]?.[0]), y: coord(pts[i - 1]?.[1]) },
            end: { x: coord(pts[i]?.[0]), y: coord(pts[i]?.[1]) },
            color: hexToRgb(String(ov.stroke)), thickness: stroke(ov.strokeWidth), lineCap: 1,
          });
        }
        break;
      }
      case "image": {
        const file = ctx.extras[String(ov.image)];
        if (!file) break;
        let img = images.get(ov.image);
        if (!img) {
          const bytes = await readFile(file.path);
          try {
            img = bytes[0] === 0x89 ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
          } catch {
            throw new ToolError("One of the images could not be read. Use PNG or JPG.");
          }
          images.set(ov.image, img);
        }
        page.drawImage(img, { x: coord(ov.x), y: coord(ov.y), width: extent(ov.w), height: extent(ov.h) });
        break;
      }
    }
  }
}

function overlayTool(suffix: string, emptyMessage: string): Processor {
  return async (ctx) => {
    const f = ctx.inputs[0];
    const overlays = json<Overlay[]>(ctx.opts.overlays, []);
    if (!overlays.length) throw new ToolError(emptyMessage);
    const doc = await loadPdf(f.path, f.name);
    await applyOverlays(ctx, doc, overlays);
    return [await savePdf(ctx, doc, `${baseName(f.name)}_${suffix}.pdf`)];
  };
}

type FormSpec = {
  fill: Record<string, string | boolean>;
  create: { page: number; kind: "text" | "checkbox"; name: string; x: number; y: number; w: number; h: number }[];
  flatten?: boolean;
};

const forms: Processor = async (ctx) => {
  const f = ctx.inputs[0];
  const spec = json<FormSpec>(ctx.opts.form, { fill: {}, create: [] });
  const doc = await loadPdf(f.path, f.name);
  const form = doc.getForm();
  const used = new Set(form.getFields().map((x) => x.getName()));
  for (const c of spec.create) {
    let name = c.name.trim() || `field_${used.size + 1}`;
    while (used.has(name)) name = `${name}_${used.size + 1}`;
    used.add(name);
    const page = doc.getPage(Math.max(1, Math.min(doc.getPageCount(), c.page)) - 1);
    const box = { x: c.x, y: c.y, width: c.w, height: c.h };
    if (c.kind === "checkbox") form.createCheckBox(name).addToPage(page, box);
    else form.createTextField(name).addToPage(page, { ...box, borderWidth: 1 });
  }
  for (const [name, value] of Object.entries(spec.fill)) {
    const field = form.getFieldMaybe(name);
    if (!field) continue;
    const type = field.constructor.name;
    if (type === "PDFTextField") form.getTextField(name).setText(String(value));
    else if (type === "PDFCheckBox") {
      if (value) form.getCheckBox(name).check();
      else form.getCheckBox(name).uncheck();
    }
    else if (type === "PDFDropdown") form.getDropdown(name).select(String(value));
    else if (type === "PDFRadioGroup" && value) form.getRadioGroup(name).select(String(value));
  }
  if (spec.flatten) form.flatten();
  return [await savePdf(ctx, doc, `${baseName(f.name)}_form.pdf`)];
};

// ---------- Security ----------

/**
 * Runs qpdf with its arguments in an "@file" instead of the command line, so
 * passwords never appear in the OS process list. The file is removed after.
 */
async function qpdfWithArgsFile(ctx: Ctx, args: string[]) {
  if (args.some((a) => /[\r\n]/.test(a))) throw new ToolError("Passwords cannot contain line breaks.");
  const argsFile = path.join(ctx.job.dir, `qpdf-${randomUUID()}.args`);
  await writeFile(argsFile, args.join("\n"), { mode: 0o600 });
  try {
    await run(need("qpdf"), [`@${argsFile}`]);
  } finally {
    await rm(argsFile, { force: true });
  }
}

const protect = eachFile(async (ctx, f) => {
  const pw = ctx.opts.password ?? "";
  if (pw.length < 1) throw new ToolError("Type a password.");
  if (pw.length > 128) throw new ToolError("Use a password of at most 128 characters.");
  if (pw !== ctx.opts.repeat) throw new ToolError("Passwords do not match.");
  const name = `${baseName(f.name)}_protected.pdf`;
  try {
    await qpdfWithArgsFile(ctx, ["--encrypt", pw, pw, "256", "--", f.path, outPath(ctx, name)]);
  } catch (e) {
    if (e instanceof ToolError) throw e;
    if (String(e).includes("password")) throw new ToolError(`"${f.name}" is already password protected.`);
    throw e;
  }
  return [{ path: outPath(ctx, name), name }];
});

const unlock = eachFile(async (ctx, f) => {
  const name = `${baseName(f.name)}_unlocked.pdf`;
  const args = ["--decrypt", "--warning-exit-0"];
  if (ctx.opts.password) args.push(`--password=${ctx.opts.password}`);
  try {
    await qpdfWithArgsFile(ctx, [...args, f.path, outPath(ctx, name)]);
  } catch (e) {
    if (e instanceof ToolError) throw e;
    if (String(e).toLowerCase().includes("invalid password")) {
      throw new ToolError(`"${f.name}" needs its password to open. Type it in the password box.`);
    }
    throw e;
  }
  return [{ path: outPath(ctx, name), name }];
});

const redact: Processor = async (ctx) => {
  const f = ctx.inputs[0];
  const specPath = path.join(ctx.job.dir, "redact.json");
  await writeFile(specPath, ctx.opts.redactions ?? "{}");
  const name = `${baseName(f.name)}_redacted.pdf`;
  await python("redact", [f.path, outPath(ctx, name), specPath]);
  return [{ path: outPath(ctx, name), name }];
};

// ---------- Registry ----------

export const PROCESSORS: Record<string, Processor> = {
  "merge-pdf": merge,
  "split-pdf": split,
  "organize-pdf": organize,
  "compress-pdf": compress,
  "repair-pdf": repair,
  "ocr-pdf": ocr,
  "pdf-to-word": pythonConvert("pdf2docx", "docx"),
  "pdf-to-powerpoint": pythonConvert("pdf2pptx", "pptx"),
  "pdf-to-excel": pythonConvert("pdf2xlsx", "xlsx"),
  "pdf-to-markdown": pythonConvert("pdf2md", "md"),
  "word-to-pdf": officeToPdf,
  "powerpoint-to-pdf": officeToPdf,
  "excel-to-pdf": officeToPdf,
  "pdf-to-jpg": pdfToJpg,
  "jpg-to-pdf": imagesToPdf,
  "scan-to-pdf": imagesToPdf,
  "pdf-to-pdfa": pdfToPdfa,
  "add-watermark": watermark,
  "add-page-numbers": pageNumbers,
  "rotate-pdf": rotate,
  "crop-pdf": crop,
  "edit-pdf": overlayTool("edited", "Add some text, a shape or a drawing before saving."),
  "sign-pdf": overlayTool("signed", "Place your signature on the document first."),
  "pdf-forms": forms,
  "protect-pdf": protect,
  "unlock-pdf": unlock,
  "redact-pdf": redact,
};
