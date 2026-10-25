import "server-only";
import { copyFile, mkdir, mkdtemp, open, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import {
  PDFDocument,
  PDFEmbeddedPage,
  PageSizes,
  degrees,
  PDFName,
  PDFArray,
  type PDFImage,
  type PDFPage,
  type PDFPageDrawImageOptions,
  type PDFPageDrawPageOptions,
} from "pdf-lib";
import { existsSync, readdirSync, realpathSync } from "node:fs";
import { OCR_LANGUAGES } from "@/lib/tools";
import { engines, need, python, run, ToolError } from "./engines";
import type { Job, JobFile } from "./jobs";
import { logError } from "./monitor";
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

// One small upload can turn into a huge result (one big image shared by
// thousands of pages, split into thousands of files), so every tool run gets an
// output budget, a cap on output files and a cap on output pages.
const MAX_OUTPUT_BYTES = 1024 * 1024 * 1024;
const MIN_OUTPUT_BYTES = 256 * 1024 * 1024;
const MAX_OUTPUTS = 1000;
const MAX_OUTPUT_PAGES = 20_000;
const TOO_MANY = "Too many items on the document.";
const TOO_BIG = "This file took too long to process. Try a smaller file.";
const outputBudgets = new WeakMap<Ctx["job"], { files: number; bytes: number; limit: number }>();

/**
 * Counts one output file of `bytes` against the run's budget: at most
 * MAX_OUTPUTS files and 4x the input size in bytes (between 256 MB and 1 GB).
 */
async function spendOutput(ctx: Ctx, bytes: number) {
  let budget = outputBudgets.get(ctx.job);
  if (!budget) {
    let input = 0;
    for (const f of ctx.inputs) input += await stat(f.path).then((s) => s.size, () => 0);
    const limit = Math.min(MAX_OUTPUT_BYTES, Math.max(MIN_OUTPUT_BYTES, input * 4));
    budget = outputBudgets.get(ctx.job) ?? { files: 0, bytes: 0, limit };
    outputBudgets.set(ctx.job, budget);
  }
  budget.files += 1;
  budget.bytes += bytes;
  if (budget.files > MAX_OUTPUTS) throw new ToolError(TOO_MANY);
  if (budget.bytes > budget.limit) throw new ToolError(TOO_BIG);
}

async function writeOutput(ctx: Ctx, name: string, bytes: Uint8Array): Promise<Output> {
  await spendOutput(ctx, bytes.byteLength);
  const p = outPath(ctx, name);
  await writeFile(p, bytes);
  return { path: p, name };
}

async function savePdf(ctx: Ctx, doc: PDFDocument, name: string): Promise<Output> {
  return writeOutput(ctx, name, await doc.save());
}

async function readHead(file: string, length: number) {
  const fh = await open(file, "r");
  try {
    const buf = Buffer.alloc(length);
    const { bytesRead } = await fh.read(buf, 0, length, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

const DAMAGED = '"{file}" is not a valid PDF or is damaged. Try Repair PDF first.';

/** Where "%PDF-" starts in the first KiB of the file; a ToolError naming the file when it is not there. */
async function pdfHeaderAt(f: JobFile) {
  const at = (await readHead(f.path, 1024)).indexOf("%PDF-", 0, "latin1");
  if (at < 0) throw new ToolError(DAMAGED, { file: f.name });
  return at;
}

/**
 * Ghostscript runs any file that does not start with "%PDF-" as a PostScript
 * program, which exposes the whole PostScript interpreter (and every -dSAFER
 * escape) to uploads. Returns a path that starts with "%PDF-": junk before the
 * header, which PDF readers tolerate, is cut off into a copy.
 */
export async function pdfForGhostscript(ctx: Ctx, f: JobFile): Promise<string> {
  const at = await pdfHeaderAt(f);
  if (at === 0) return f.path;
  const copy = path.join(ctx.job.dir, `gs-${randomUUID()}.pdf`);
  await writeFile(copy, (await readFile(f.path)).subarray(at));
  return copy;
}

/** Ghostscript expands %d etc. in -sOutputFile; "%%" is a literal percent sign. */
const gsOutputFile = (p: string) => `-sOutputFile=${p.replaceAll("%", "%%")}`;

// pdf-lib decodes PNGs (and re-compresses them) synchronously, at about one
// second per megapixel, so a tiny, highly compressed PNG with huge dimensions
// would freeze the whole site. PNGs are limited in size and embedded in a worker
// thread (see embedImage). JPEGs are embedded without decoding.
export const MAX_PNG_PIXELS = 25_000_000;
export const MAX_PNG_PIXELS_TOTAL = 60_000_000;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Checks the size in a PNG's header before pdf-lib decodes it, and takes it
 * from `budget.pixels`. Anything starting with 0x89 is treated as a PNG, as
 * the callers do. Throws a ToolError when the image is too large.
 */
export function checkPngSize(head: Uint8Array, budget: { pixels: number }) {
  if (head[0] !== 0x89) return;
  const b = Buffer.from(head.buffer, head.byteOffset, head.byteLength);
  // Signature (8) + IHDR length (4) + "IHDR" (4) + width (4) + height (4).
  const ok = b.length >= 24 && b.subarray(0, 8).equals(PNG_SIGNATURE) && b.toString("latin1", 12, 16) === "IHDR";
  const pixels = ok ? b.readUInt32BE(16) * b.readUInt32BE(20) : Infinity;
  if (pixels > MAX_PNG_PIXELS || pixels > budget.pixels) throw new ToolError(TOO_BIG);
  budget.pixels -= pixels;
}

// Turns a PNG into a one-page PDF showing it. The image in that PDF is already
// compressed, so this thread only copies it (embedPdf), without decoding it.
const PNG_WORKER = `
const { parentPort, workerData } = require("node:worker_threads");
const { PDFDocument } = require("node:module").createRequire(workerData.base)("pdf-lib");
(async () => {
  const doc = await PDFDocument.create();
  const img = await doc.embedPng(workerData.bytes);
  doc.addPage([img.width, img.height]).drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  const out = await doc.save();
  parentPort.postMessage(out, [out.buffer]);
})().catch((e) => parentPort.postMessage({ error: String((e && e.message) || e) }));
`;
const PNG_WORKER_TIMEOUT_MS = 120_000;
const PNG_WORKERS = 2;
let pngWorkersBusy = 0;
const pngWorkerQueue: (() => void)[] = [];

function runPngWorker(bytes: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(PNG_WORKER, {
      eval: true,
      workerData: { bytes, base: path.join(/* turbopackIgnore: true */ process.cwd(), "package.json") },
      resourceLimits: { maxOldGenerationSizeMb: 512 },
    });
    const done = () => {
      clearTimeout(timer);
      void worker.terminate();
    };
    const timer = setTimeout(() => {
      done();
      reject(new ToolError(TOO_BIG));
    }, PNG_WORKER_TIMEOUT_MS);
    worker.once("message", (m: Uint8Array | { error: string }) => {
      done();
      if (m instanceof Uint8Array) resolve(m);
      else reject(new Error(m.error));
    });
    worker.once("error", (e) => {
      done();
      reject(e);
    });
    worker.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`PNG worker exited with code ${code}`));
    });
  });
}

async function pngToPdf(bytes: Uint8Array) {
  if (pngWorkersBusy < PNG_WORKERS) pngWorkersBusy++;
  else await new Promise<void>((r) => pngWorkerQueue.push(r)); // the slot is handed over
  try {
    return await runPngWorker(bytes);
  } finally {
    const next = pngWorkerQueue.shift();
    if (next) next();
    else pngWorkersBusy--;
  }
}

type EmbeddedImage = PDFImage | PDFEmbeddedPage;

/** Embeds a PNG (anything starting with 0x89) or a JPEG; draw it with drawEmbedded. */
async function embedImage(doc: PDFDocument, bytes: Uint8Array): Promise<EmbeddedImage> {
  if (bytes[0] !== 0x89) return doc.embedJpg(bytes);
  const [page] = await doc.embedPdf(await pngToPdf(bytes));
  return page;
}

function drawEmbedded(page: PDFPage, img: EmbeddedImage, o: PDFPageDrawImageOptions & PDFPageDrawPageOptions) {
  if (img instanceof PDFEmbeddedPage) page.drawPage(img, o);
  else page.drawImage(img, o);
}

function json<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new ToolError("The tool settings could not be read. Reload the page and try again.");
  }
}

/**
 * A rotation from the browser or the API ("90", -90, 45, junk) as a quarter
 * turn in 0..359. pdf-lib only accepts multiples of 90, and anything else would
 * fail as a generic error, so values are rounded to the nearest quarter turn.
 */
function quarterTurn(v: unknown): number {
  const turns = Math.round(num(v, -1e6, 1e6, 0) / 90);
  return (((turns % 4) + 4) % 4) * 90;
}

/** Turns a page by `extra` degrees on top of its own rotation. */
function turnPage(p: PDFPage, extra: unknown) {
  const turn = quarterTurn(extra);
  if (turn) p.setRotation(degrees(quarterTurn(p.getRotation().angle + turn)));
}

/** The value stored under `key` when `obj` is a JSON object, else undefined. */
function entry(obj: unknown, key: string | number): unknown {
  return obj && typeof obj === "object" ? (obj as Record<string, unknown>)[key] : undefined;
}

function eachFile(fn: (ctx: Ctx, file: JobFile, i: number) => Promise<Output[]>): Processor {
  return async (ctx) => (await Promise.all(ctx.inputs.map((f, i) => fn(ctx, f, i)))).flat();
}

// ---------- Organize ----------

const merge: Processor = async (ctx) => {
  if (ctx.inputs.length < 2) throw new ToolError("Select at least 2 PDF files to merge.");
  const rotations = json<unknown>(ctx.opts.rotations, {});
  const out = await PDFDocument.create();
  for (const [i, f] of ctx.inputs.entries()) {
    const src = await loadPdf(f.path, f.name);
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const p of pages) {
      turnPage(p, entry(rotations, i));
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
    const ranges = parseRanges(ctx.opts.ranges ?? "", total);
    // Check before building the page lists: "1-9999" repeated is a short string.
    const pages = ranges.reduce((s, [a, b]) => s + b - a + 1, 0);
    if ((!merged && ranges.length > MAX_OUTPUTS) || pages > MAX_OUTPUT_PAGES) throw new ToolError(TOO_MANY);
    groups = ranges.map(([a, b]) => range(a, b));
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
  if (groups.length > MAX_OUTPUTS) throw new ToolError(TOO_MANY);
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
  const save = async (a: number, b: number) => (await extractPages(src, range(a, b))).save();
  let start = 1;
  while (start <= total) {
    if (outputs.length >= MAX_OUTPUTS) throw new ToolError(TOO_MANY);
    // Find the longest chunk that stays under the limit (always at least one
    // page). Doubling then halving needs O(log n) saves per chunk; growing one
    // page at a time needed O(n), which made big documents quadratic.
    let end = start;
    let best = await save(start, start);
    let bad = total + 1; // first end page known to be too big
    for (let step = 1; end < total; step *= 2) {
      const probe = Math.min(total, start + step);
      const bytes = await save(start, probe);
      if (bytes.byteLength > maxBytes) {
        bad = probe;
        break;
      }
      [end, best] = [probe, bytes];
    }
    while (bad - end > 1) {
      const mid = Math.floor((end + bad) / 2);
      const bytes = await save(start, mid);
      if (bytes.byteLength > maxBytes) bad = mid;
      else [end, best] = [mid, bytes];
    }
    outputs.push(await writeOutput(ctx, `${stem}_${start}-${end}.pdf`, best));
    start = end + 1;
  }
  return outputs;
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

const removePages = eachFile(async (ctx, f) => {
  if (!ctx.opts.pages?.trim()) throw new ToolError("Choose the pages you want to remove.");
  const src = await loadPdf(f.path, f.name);
  const total = src.getPageCount();
  const remove = new Set(parsePageList(ctx.opts.pages, total));
  const keep = range(1, total).filter((p) => !remove.has(p));
  if (!keep.length) throw new ToolError("You can't remove every page. Keep at least one page.");
  return [await savePdf(ctx, await extractPages(src, keep), `${baseName(f.name)}_pages_removed.pdf`)];
});

const extractPagesTool = eachFile(async (ctx, f) => {
  if (!ctx.opts.pages?.trim()) throw new ToolError("Choose the pages you want to extract.");
  const src = await loadPdf(f.path, f.name);
  const pages = parsePageList(ctx.opts.pages, src.getPageCount());
  const stem = baseName(f.name);
  if (ctx.opts.separate !== "true") return [await savePdf(ctx, await extractPages(src, pages), `${stem}_extracted.pdf`)];
  if (pages.length > MAX_OUTPUTS) throw new ToolError(TOO_MANY);
  const outputs: Output[] = [];
  for (const p of pages) outputs.push(await savePdf(ctx, await extractPages(src, [p]), `${stem}_page_${p}.pdf`));
  return outputs;
});

type OrganizeItem = { file: number; page: number; rotate?: number } | { blank: true; width?: number; height?: number };

const organize: Processor = async (ctx) => {
  const items = json<OrganizeItem[]>(ctx.opts.pages, []);
  if (!Array.isArray(items) || !items.length) throw new ToolError("Your document has no pages left. Add at least one page.");
  const sources = await Promise.all(ctx.inputs.map((f) => loadPdf(f.path, f.name)));
  const totalPages = sources.reduce((s, d) => s + d.getPageCount(), 0);
  if (items.length > Math.min(MAX_OUTPUT_PAGES, Math.max(100, totalPages * 5))) throw new ToolError(TOO_MANY);

  // Copy all pages taken from one source in a single copyPages call: one copier
  // copies shared resources (images, fonts) once, however often a page repeats.
  const wanted = sources.map(() => [] as number[]);
  const plan = items.map((it) => {
    if (!it || typeof it !== "object") return undefined;
    if ("blank" in it) return null;
    const file = Number(it.file);
    const page = Number(it.page);
    if (!Number.isInteger(file) || !sources[file] || !Number.isInteger(page) || page < 1 || page > sources[file].getPageCount()) {
      return undefined; // skipped, as before
    }
    wanted[file].push(page - 1);
    return { file, slot: wanted[file].length - 1 };
  });
  const out = await PDFDocument.create();
  const copied: PDFPage[][] = [];
  for (const [i, src] of sources.entries()) copied.push(wanted[i].length ? await out.copyPages(src, wanted[i]) : []);
  for (const [i, it] of items.entries()) {
    const step = plan[i];
    if (step === null) {
      const blank = it as { width?: unknown; height?: unknown };
      out.addPage([num(blank.width, 1, 14400, PageSizes.A4[0]), num(blank.height, 1, 14400, PageSizes.A4[1])]);
      continue;
    }
    if (!step) continue;
    const p = copied[step.file][step.slot];
    turnPage(p, (it as { rotate?: unknown }).rotate);
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
  const input = await pdfForGhostscript(ctx, f);
  await run(gs, [
    "-sDEVICE=pdfwrite",
    "-dCompatibilityLevel=1.5",
    `-dPDFSETTINGS=${GS_LEVEL[ctx.opts.level] ?? "/ebook"}`,
    "-dDetectDuplicateImages=true",
    "-dNOPAUSE",
    "-dBATCH",
    "-dQUIET",
    "-dSAFER",
    gsOutputFile(target),
    input,
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

const OCR_CODES = new Map(OCR_LANGUAGES);

/** Validates "eng+hin" style input against the offered and installed languages. */
function ocrLanguages(raw: string | undefined) {
  const codes = [...new Set((raw || "eng").split("+").map((s) => s.trim()).filter(Boolean))];
  if (codes.length > 5) throw new ToolError("Choose at most 5 languages.");
  const unknown = codes.filter((c) => !OCR_CODES.has(c));
  if (unknown.length) throw new ToolError("Unsupported OCR language: {codes}.", { codes: unknown.join(", ") });
  const dir = engines.tessdata;
  const missing = dir ? codes.filter((c) => !existsSync(path.join(dir, `${c}.traineddata`))) : codes;
  if (missing.length) {
    throw new ToolError("OCR for {languages} is not installed on this server yet.", { languages: missing.map((c) => OCR_CODES.get(c)).join(", ") });
  }
  return codes.join("+");
}

const ocr: Processor = async (ctx) => {
  const lang = ocrLanguages(ctx.opts.language); // checked once, before any file is processed
  return (
    await Promise.all(
      ctx.inputs.map(async (f) => {
        const name = `${baseName(f.name)}_ocr.pdf`;
        await python("ocr", [f.path, outPath(ctx, name), lang], 900_000);
        return { path: outPath(ctx, name), name };
      }),
    )
  );
};

// ---------- Convert ----------

/** `ocrable` tools can recognize scanned pages first (the "ocr" option). */
function pythonConvert(command: string, ext: string, ocrable = false) {
  return async (ctx: Ctx) => {
    const lang = ocrable && ctx.opts.ocr === "true" ? ocrLanguages(ctx.opts.language) : null;
    return eachFile(async (ctx, f) => {
      const name = `${baseName(f.name)}.${ext}`;
      if (lang) await python("ocr-convert", [ext, f.path, outPath(ctx, name), lang], 900_000);
      else await python(command, [f.path, outPath(ctx, name)], 600_000);
      return [{ path: outPath(ctx, name), name }];
    })(ctx);
  };
}

// LibreOffice initialises a user profile on first use (~10 s). Reusing one
// profile makes later conversions fast, but a profile allows only one running
// instance, so conversions are queued one after another.
let loProfileDir = path.join(os.tmpdir(), "workify-lo-profile");
let loQueue: Promise<unknown> = Promise.resolve();
function withLibreOffice<T>(fn: () => Promise<T>): Promise<T> {
  const next = loQueue.then(fn, fn);
  loQueue = next.catch(() => {});
  return next;
}

// Uploaded documents may link images, sections, stylesheets or data by URL
// (http://169.254.169.254/..., file:///app/data/...). LibreOffice would fetch
// them from inside the server's network and draw them into the PDF, so the
// profile blocks every link from a document, macros, OLE/DDE and link updates.
const loSettings: [path: string, prop: string, value: string][] = [
  ["/org.openoffice.Office.Common/Security/Scripting", "BlockUntrustedRefererLinks", "true"],
  ["/org.openoffice.Office.Common/Security/Scripting", "DisableMacrosExecution", "true"],
  ["/org.openoffice.Office.Common/Security/Scripting", "DisableActiveContent", "true"],
  ["/org.openoffice.Office.Writer/Content/Update", "Link", "0"], // never
  ["/org.openoffice.Office.Calc/Content/Update", "Link", "1"], // never
];
const loItem = ([p, prop, value]: (typeof loSettings)[number]) =>
  `<item oor:path="${p}"><prop oor:name="${prop}" oor:op="fuse"><value>${value}</value></prop></item>`;

/** Makes sure the profile has loSettings (LibreOffice keeps them when it rewrites the file). */
export async function prepareLibreOfficeProfile(dir: string) {
  const file = path.join(dir, "user", "registrymodifications.xcu");
  const current = await readFile(file, "utf8").catch(() => "");
  if (loSettings.every((s) => current.includes(loItem(s)))) return;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    `<?xml version="1.0" encoding="UTF-8"?>\n<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n${loSettings.map(loItem).join("\n")}\n</oor:items>\n`,
  );
}

/**
 * Runs a command that may leave child processes behind (soffice -> oosplash ->
 * soffice.bin). On Linux coreutils `timeout` kills the whole process group when
 * time is up; execFile's own timeout would only kill the direct child.
 */
const COREUTILS_TIMEOUT = process.platform !== "win32" && existsSync("/usr/bin/timeout") ? "/usr/bin/timeout" : null;
async function runTree(file: string, args: string[], timeoutMs: number) {
  const command = [...(await offlinePrefix()), file, ...args];
  if (!COREUTILS_TIMEOUT) return run(command[0], command.slice(1), { timeoutMs });
  const secs = String(Math.ceil(timeoutMs / 1000));
  return run(COREUTILS_TIMEOUT, ["-k", "10", secs, ...command], { timeoutMs: timeoutMs + 30_000 });
}

/**
 * LibreOffice never needs the network, so on Linux it runs in a new, empty
 * network namespace: a document cannot make the server fetch internal URLs
 * (cloud metadata, other containers) even if a link setting is missed. This
 * needs user namespaces (docker-compose.yml allows them); where the host
 * forbids them, conversions still run, without this extra wall, and the error
 * log says so once.
 */
const UNSHARE = process.platform !== "win32" && existsSync("/usr/bin/unshare") ? "/usr/bin/unshare" : null;
let offline: Promise<string[]> | null = null;
function offlinePrefix(): Promise<string[]> {
  return (offline ??= (async () => {
    if (!UNSHARE) return [];
    const prefix = [UNSHARE, "--user", "--map-current-user", "--net", "--"];
    try {
      await run(UNSHARE, [...prefix.slice(1), "true"], { timeoutMs: 10_000 });
      return prefix;
    } catch (e) {
      logError("libreoffice", "User namespaces are not available: LibreOffice runs without network isolation (see DEPLOY.md).", e);
      return [];
    }
  })());
}

const OLE2 = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP = Buffer.from("PK\x03\x04", "latin1");
const RTF = Buffer.from("{\\rtf", "latin1");
// Plain text goes through a fixed import filter: LibreOffice otherwise detects
// the format from the content and would open, say, flat XML ODF named .txt.
const textFilters: Record<string, string> = { txt: "Text (encoded)", csv: "Text - txt - csv (StarCalc)" };

/** Office documents by extension, checked on the server: browsers' `accept` lists are only a hint. */
export function checkOfficeFile(exts: readonly string[], name: string, head: Buffer) {
  const ext = path.extname(name).slice(1).toLowerCase();
  const binary = [OLE2, ZIP, RTF].some((magic) => head.subarray(0, magic.length).equals(magic));
  if (!exts.includes(ext) || !(ext in textFilters || binary)) {
    throw new ToolError('"{file}" could not be converted. Is the file valid?', { file: name });
  }
  return textFilters[ext];
}

function officeToPdf(exts: readonly string[]): Processor {
  return eachFile(async (ctx, f) => {
    const soffice = need("soffice");
    const filter = checkOfficeFile(exts, f.name, await readHead(f.path, 8));
    const work = await mkdtemp(path.join(ctx.job.dir, "lo-"));
    const src = path.join(work, f.name);
    await copyFile(f.path, src);
    await withLibreOffice(async () => {
      const profile = loProfileDir;
      await prepareLibreOfficeProfile(profile);
      const args = [`-env:UserInstallation=${pathToFileURL(profile).href}`, "--headless", "--norestore"];
      if (filter) args.push(`--infilter=${filter}`);
      try {
        await runTree(soffice, [...args, "--convert-to", "pdf", "--outdir", work, src], 240_000);
      } catch (e) {
        // A hung or crashed instance may still hold the profile: switch to a fresh one.
        loProfileDir = path.join(os.tmpdir(), `workify-lo-profile-${randomUUID()}`);
        void rm(profile, { recursive: true, force: true }).catch(() => {});
        throw e;
      }
    });
    const pdf = (await readdir(work)).find((n) => n.toLowerCase().endsWith(".pdf"));
    if (!pdf) throw new ToolError('"{file}" could not be converted. Is the file valid?', { file: f.name });
    const name = `${baseName(f.name)}.pdf`;
    await copyFile(path.join(work, pdf), outPath(ctx, name));
    return [{ path: outPath(ctx, name), name }];
  });
}

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

  // Check every header before decoding anything.
  const budget = { pixels: MAX_PNG_PIXELS_TOTAL };
  for (const f of ctx.inputs) checkPngSize(await readHead(f.path, 24), budget);

  const addImage = async (doc: PDFDocument, f: JobFile) => {
    let img;
    try {
      img = await embedImage(doc, await readFile(f.path));
    } catch (e) {
      if (e instanceof ToolError) throw e;
      throw new ToolError('"{file}" is not a supported image.', { file: f.name });
    }
    let [pw, ph] =
      size === "a4" ? PageSizes.A4 : size === "letter" ? PageSizes.Letter : [img.width + margin * 2, img.height + margin * 2];
    if (size !== "fit" && landscape) [pw, ph] = [ph, pw];
    const page = doc.addPage([pw, ph]);
    const scale = Math.min((pw - margin * 2) / img.width, (ph - margin * 2) / img.height, size === "fit" ? 1 : Infinity);
    const w = img.width * scale;
    const h = img.height * scale;
    drawEmbedded(page, img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
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

let srgbProfile: string | null | undefined;

/** Ghostscript's own sRGB ICC profile (Windows install or Debian's libgs-common), or null. */
function findSrgbProfile(gs: string): string | null {
  if (srgbProfile !== undefined) return srgbProfile;
  const dirs = [path.join(path.dirname(gs), "..", "iccprofiles"), "/usr/share/color/icc/ghostscript"];
  try {
    for (const v of readdirSync("/usr/share/ghostscript")) dirs.push(path.join("/usr/share/ghostscript", v, "iccprofiles"));
  } catch {
    // not a Debian-style install
  }
  const found = dirs.map((d) => path.join(d, "srgb.icc")).find((p) => existsSync(p));
  srgbProfile = found ? realpathSync(found).replaceAll("\\", "/") : null;
  if (!srgbProfile) logError("pdf-to-pdfa", "Ghostscript's srgb.icc was not found: PDF/A files will lack an OutputIntent.");
  return srgbProfile;
}

const PDFA_FAILED = "WORKIFY-PDFA-NO-ICC";

/**
 * PDF/A needs an /OutputIntents entry with an embedded ICC profile whenever
 * device colours are used; Ghostscript only adds one from a PostScript prefix
 * file (like its lib/PDFA_def.ps). The profile path is a hex string so no path
 * character can break out of the PostScript string.
 */
function pdfaDef(icc: string) {
  return `%!
/ICCProfile <${Buffer.from(icc, "utf8").toString("hex")}> def
[/_objdef {icc_PDFA} /type /stream /OBJ pdfmark
[{icc_PDFA} << /N 3 >> /PUT pdfmark
[{icc_PDFA} {ICCProfile (r) file} stopped
{ cleartomark (${PDFA_FAILED}\n) print }
{
  /PUT pdfmark
  [/_objdef {OutputIntent_PDFA} /type /dict /OBJ pdfmark
  [{OutputIntent_PDFA} << /Type /OutputIntent /S /GTS_PDFA1 /DestOutputProfile {icc_PDFA}
    /OutputConditionIdentifier (sRGB) /Info (sRGB IEC61966-2.1) >> /PUT pdfmark
  [{Catalog} << /OutputIntents [ {OutputIntent_PDFA} ] >> /PUT pdfmark
} ifelse
`;
}

const pdfToPdfa = eachFile(async (ctx, f) => {
  const gs = need("ghostscript");
  const level = ["1", "2", "3"].includes(ctx.opts.conformance) ? ctx.opts.conformance : "2";
  const name = `${baseName(f.name)}_pdfa.pdf`;
  const input = await pdfForGhostscript(ctx, f);
  const icc = findSrgbProfile(gs);
  const prefix: string[] = [];
  if (icc) {
    const def = path.join(ctx.job.dir, `pdfa-${randomUUID()}.ps`);
    await writeFile(def, pdfaDef(icc));
    prefix.push(`--permit-file-read=${icc}`, def);
  }
  const { stdout } = await run(gs, [
    `-dPDFA=${level}`,
    "-dPDFACompatibilityPolicy=1",
    "-sColorConversionStrategy=RGB",
    "-sDEVICE=pdfwrite",
    "-dNOPAUSE",
    "-dBATCH",
    "-dQUIET",
    "-dSAFER",
    gsOutputFile(outPath(ctx, name)),
    ...prefix,
    input,
  ]);
  if (stdout.includes(PDFA_FAILED)) logError("pdf-to-pdfa", `Ghostscript could not read ${icc}: the PDF/A file lacks an OutputIntent.`);
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
    checkPngSize(bytes, { pixels: MAX_PNG_PIXELS });
    const embedded = await embedImage(doc, bytes);
    const first = doc.getPage(0).getSize();
    const scale = Math.min(1, (first.width * 0.4) / embedded.width);
    boxW = embedded.width * scale;
    boxH = embedded.height * scale;
    draw = (page, x, y) =>
      drawEmbedded(page, embedded, { x, y, width: boxW, height: boxH, opacity, rotate: degrees(rotation) });
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
  // Whole page numbers only: "1.5" would make getPage(0.5) undefined.
  const from = Math.max(1, Math.round(Number(o.fromPage)) || 1);
  const to = Math.min(total, Math.round(Number(o.toPage)) || total);
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

const rotate: Processor = async (ctx) => {
  const spec = json<unknown>(ctx.opts.rotations, {});
  const outputs: Output[] = [];
  for (const [i, f] of ctx.inputs.entries()) {
    const doc = await loadPdf(f.path, f.name);
    const s = entry(spec, i);
    // Numeric strings ("90") count as numbers, not as text to concatenate.
    const all = quarterTurn(entry(s, "all"));
    const pages = entry(s, "pages");
    doc.getPages().forEach((p, idx) => turnPage(p, all + quarterTurn(entry(pages, idx + 1))));
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
  if (overlays.length > MAX_OVERLAYS) throw new ToolError("At most {max} edits can be saved at once.", { max: MAX_OVERLAYS });
  const images = new Map<string, EmbeddedImage>();
  const pngBudget = { pixels: MAX_PNG_PIXELS_TOTAL };
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
          checkPngSize(bytes, pngBudget);
          try {
            img = await embedImage(doc, bytes);
          } catch (e) {
            if (e instanceof ToolError) throw e;
            throw new ToolError("One of the images could not be read. Use PNG or JPG.");
          }
          images.set(ov.image, img);
        }
        drawEmbedded(page, img, { x: coord(ov.x), y: coord(ov.y), width: extent(ov.w), height: extent(ov.h) });
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

/** qpdf's "this is not a readable PDF" failures as a ToolError naming the file; other errors unchanged. */
function qpdfDamaged(e: unknown, f: JobFile) {
  return /not a PDF|PDF header|trailer|damaged|xref/i.test(String(e)) ? new ToolError(DAMAGED, { file: f.name }) : e;
}

const protect = eachFile(async (ctx, f) => {
  const pw = ctx.opts.password ?? "";
  if (pw.length < 1) throw new ToolError("Type a password.");
  if (pw.length > 128) throw new ToolError("Use a password of at most 128 characters.");
  if (pw !== ctx.opts.repeat) throw new ToolError("Passwords do not match.");
  await pdfHeaderAt(f);
  const name = `${baseName(f.name)}_protected.pdf`;
  try {
    await qpdfWithArgsFile(ctx, ["--encrypt", pw, pw, "256", "--", f.path, outPath(ctx, name)]);
  } catch (e) {
    if (e instanceof ToolError) throw e;
    if (String(e).includes("password")) throw new ToolError('"{file}" is already password protected.', { file: f.name });
    throw qpdfDamaged(e, f);
  }
  return [{ path: outPath(ctx, name), name }];
});

const unlock = eachFile(async (ctx, f) => {
  await pdfHeaderAt(f);
  const name = `${baseName(f.name)}_unlocked.pdf`;
  const args = ["--decrypt", "--warning-exit-0"];
  if (ctx.opts.password) args.push(`--password=${ctx.opts.password}`);
  try {
    await qpdfWithArgsFile(ctx, [...args, f.path, outPath(ctx, name)]);
  } catch (e) {
    if (e instanceof ToolError) throw e;
    if (String(e).toLowerCase().includes("invalid password")) {
      throw new ToolError('"{file}" needs its password to open. Type it in the password box.', { file: f.name });
    }
    throw qpdfDamaged(e, f);
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
  "remove-pages": removePages,
  "extract-pages": extractPagesTool,
  "pdf-to-word": pythonConvert("pdf2docx", "docx", true),
  "pdf-to-powerpoint": pythonConvert("pdf2pptx", "pptx", true),
  "pdf-to-excel": pythonConvert("pdf2xlsx", "xlsx", true),
  "pdf-to-markdown": pythonConvert("pdf2md", "md"),
  "word-to-pdf": officeToPdf(["doc", "docx", "odt", "rtf", "txt"]),
  "powerpoint-to-pdf": officeToPdf(["ppt", "pptx", "odp", "pps", "ppsx"]),
  "excel-to-pdf": officeToPdf(["xls", "xlsx", "ods", "csv"]),
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
