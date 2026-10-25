import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolError } from "./engines";
import type { JobFile } from "./jobs";
import {
  checkOfficeFile,
  checkPngSize,
  MAX_PNG_PIXELS,
  MAX_PNG_PIXELS_TOTAL,
  pdfForGhostscript,
  prepareLibreOfficeProfile,
  PROCESSORS,
  type Ctx,
} from "./processors";

// Real PDF work on big inputs: slower than the default 5 s when the whole suite runs at once.
vi.setConfig({ testTimeout: 30_000 });

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "workify-proc-"));
  await mkdir(path.join(dir, "in"));
  await mkdir(path.join(dir, "out"));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

/** A PDF whose page n is (100 + n) points wide, so pages can be told apart after processing. */
async function makePdf(name: string, pages: number): Promise<JobFile> {
  const doc = await PDFDocument.create();
  for (let i = 1; i <= pages; i++) doc.addPage([100 + i, 200]);
  const p = path.join(dir, "in", name);
  await writeFile(p, await doc.save());
  return { path: p, name };
}

function ctx(inputs: JobFile[], opts: Record<string, string>): Ctx {
  return {
    job: { id: "test", dir, inDir: path.join(dir, "in"), outDir: path.join(dir, "out") },
    inputs,
    opts,
    extras: {},
  };
}

/** Original page numbers of a processed PDF, read back from the page widths. */
async function pagesOf(file: string) {
  const doc = await PDFDocument.load(await readFile(file));
  return doc.getPages().map((p) => p.getWidth() - 100);
}

/** The ToolError a processor rejects with. */
async function toolError(promise: Promise<unknown>): Promise<ToolError> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ToolError);
  return err as ToolError;
}

describe("remove-pages", () => {
  const removePages = PROCESSORS["remove-pages"];

  it("keeps every page that was not chosen, in order", async () => {
    const out = await removePages(ctx([await makePdf("report.pdf", 6)], { pages: "2, 4-5" }));
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("report_pages_removed.pdf");
    expect(out[0].path).toBe(path.join(dir, "out", "report_pages_removed.pdf"));
    expect(await pagesOf(out[0].path)).toEqual([1, 3, 6]);
  });

  it("processes each input separately", async () => {
    const out = await removePages(ctx([await makePdf("a.pdf", 3), await makePdf("b.pdf", 5)], { pages: "1" }));
    expect(out.map((o) => o.name)).toEqual(["a_pages_removed.pdf", "b_pages_removed.pdf"]);
    expect(await pagesOf(out[0].path)).toEqual([2, 3]);
    expect(await pagesOf(out[1].path)).toEqual([2, 3, 4, 5]);
  });

  it("requires a page selection", async () => {
    const err = await toolError(removePages(ctx([await makePdf("a.pdf", 3)], { pages: "  " })));
    expect(err.template).toBe("Choose the pages you want to remove.");
  });

  it("refuses to remove every page", async () => {
    const err = await toolError(removePages(ctx([await makePdf("a.pdf", 3)], { pages: "1-" })));
    expect(err.template).toBe("You can't remove every page. Keep at least one page.");
  });

  it("reports invalid ranges from the page parser", async () => {
    const err = await toolError(removePages(ctx([await makePdf("a.pdf", 3)], { pages: "x" })));
    expect(err.vars).toEqual({ part: "x" });
  });
});

describe("extract-pages", () => {
  const extractPages = PROCESSORS["extract-pages"];

  it("extracts the chosen pages into one PDF", async () => {
    const out = await extractPages(ctx([await makePdf("doc.pdf", 8)], { pages: "7, 2-3" }));
    expect(out.map((o) => o.name)).toEqual(["doc_extracted.pdf"]);
    expect(await pagesOf(out[0].path)).toEqual([2, 3, 7]);
  });

  it("writes one PDF per page when separate is on", async () => {
    const out = await extractPages(ctx([await makePdf("doc.pdf", 5)], { pages: "1, 4-5", separate: "true" }));
    expect(out.map((o) => o.name)).toEqual(["doc_page_1.pdf", "doc_page_4.pdf", "doc_page_5.pdf"]);
    for (const [i, p] of [1, 4, 5].entries()) expect(await pagesOf(out[i].path)).toEqual([p]);
  });

  it("requires a page selection", async () => {
    const err = await toolError(extractPages(ctx([await makePdf("doc.pdf", 2)], {})));
    expect(err.template).toBe("Choose the pages you want to extract.");
  });

  it("rejects selections outside the document", async () => {
    const err = await toolError(extractPages(ctx([await makePdf("doc.pdf", 2)], { pages: "5-9" })));
    expect(err.vars).toEqual({ spec: "5-9", total: 2 });
  });

  it("names damaged inputs in the error", async () => {
    const bad = path.join(dir, "in", "broken.pdf");
    await writeFile(bad, "not a pdf at all");
    const err = await toolError(extractPages(ctx([{ path: bad, name: "broken.pdf" }], { pages: "1" })));
    expect(err.vars).toEqual({ file: "broken.pdf" });
  });
});

/** A one-page PDF drawing one `size`-byte JPEG (only its header is real, which is all pdf-lib reads). */
async function pdfWithImage(name: string, size: number): Promise<JobFile> {
  const sof = [0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x10, 0x00, 0x10, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01];
  const jpg = Buffer.concat([Buffer.from(sof), randomBytes(size), Buffer.from([0xff, 0xd9])]);
  const doc = await PDFDocument.create();
  const img = await doc.embedJpg(jpg);
  doc.addPage([200, 200]).drawImage(img, { x: 0, y: 0, width: 100, height: 100 });
  const p = path.join(dir, "in", name);
  await writeFile(p, await doc.save());
  return { path: p, name };
}

/** A PNG header of the given size: enough for the size check, which runs before decoding. */
function pngHeader(width: number, height: number) {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "latin1");
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

/** A valid RGBA PNG with random pixels (random data keeps pdf-lib busy for real). */
function rgbaPng(width: number, height: number) {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA, not interlaced
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) randomBytes(width * 4).copy(raw, y * (width * 4 + 1) + 1);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([png, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 1 })), chunk("IEND", Buffer.alloc(0))]);
}

const TOO_BIG = "This file took too long to process. Try a smaller file.";
const TOO_MANY = "Too many items on the document.";

describe("pdfForGhostscript", () => {
  it("passes real PDFs through unchanged", async () => {
    const f = await makePdf("a.pdf", 1);
    expect(await pdfForGhostscript(ctx([f], {}), f)).toBe(f.path);
  });

  it("refuses PostScript and other files named .pdf", async () => {
    const ps = path.join(dir, "in", "ps.pdf");
    await writeFile(ps, "%!PS\n/Helvetica findfont 24 scalefont setfont 72 700 moveto product show showpage\n");
    const err = await toolError(pdfForGhostscript(ctx([], {}), { path: ps, name: "ps.pdf" }));
    expect(err.vars).toEqual({ file: "ps.pdf" });
  });

  it("cuts junk before the header off, so Ghostscript never reads PostScript first", async () => {
    const f = await makePdf("a.pdf", 1);
    const junky = path.join(dir, "in", "junky.pdf");
    await writeFile(junky, Buffer.concat([Buffer.from("%!PS\nproduct show\n"), await readFile(f.path)]));
    const out = await pdfForGhostscript(ctx([], {}), { path: junky, name: "junky.pdf" });
    expect(out).not.toBe(junky);
    expect((await readFile(out)).subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});

describe("PNG size limits", () => {
  it("allows normal images and ignores JPEGs", () => {
    expect(() => checkPngSize(pngHeader(4000, 3000), { pixels: MAX_PNG_PIXELS_TOTAL })).not.toThrow();
    expect(() => checkPngSize(Buffer.from([0xff, 0xd8, 0xff]), { pixels: 0 })).not.toThrow();
  });

  it("refuses decompression bombs, too many pixels in total and broken headers", () => {
    expect(MAX_PNG_PIXELS).toBeLessThan(12000 * 12000);
    expect(() => checkPngSize(pngHeader(12000, 12000), { pixels: MAX_PNG_PIXELS_TOTAL })).toThrow(ToolError);
    const budget = { pixels: MAX_PNG_PIXELS_TOTAL };
    checkPngSize(pngHeader(5000, 5000), budget);
    checkPngSize(pngHeader(5000, 5000), budget);
    expect(() => checkPngSize(pngHeader(5000, 5000), budget)).toThrow(ToolError);
    const bad = pngHeader(10, 10);
    bad.write("tEXt", 12, "latin1");
    expect(() => checkPngSize(bad, { pixels: MAX_PNG_PIXELS_TOTAL })).toThrow(ToolError);
  });

  it("decodes PNGs off the main thread, so the server keeps responding", async () => {
    const p = path.join(dir, "in", "big.png");
    await writeFile(p, rgbaPng(1500, 1500));
    let lag = 0;
    let last = Date.now();
    const tick = setInterval(() => {
      lag = Math.max(lag, Date.now() - last);
      last = Date.now();
    }, 10);
    try {
      const [out] = await PROCESSORS["jpg-to-pdf"](ctx([{ path: p, name: "big.png" }], {}));
      const page = (await PDFDocument.load(await readFile(out.path))).getPage(0);
      expect([page.getWidth(), page.getHeight()]).toEqual([1500, 1500]);
    } finally {
      clearInterval(tick);
    }
    // Decoding this PNG on the main thread blocks it for 2 s or more; the
    // margin keeps the check stable when the whole suite loads the machine.
    expect(lag).toBeLessThan(1000);
  }, 60_000);

  it("draws PNG watermarks and PNG edits", async () => {
    const png = path.join(dir, "in", "logo.png");
    await writeFile(png, rgbaPng(40, 20));
    const extras = { image: { path: png, name: "logo.png" }, sig: { path: png, name: "logo.png" } };
    const f = await makePdf("a.pdf", 2);
    const [wm] = await PROCESSORS["add-watermark"]({ ...ctx([f], { kind: "image", mosaic: "true" }), extras });
    const overlays = JSON.stringify([1, 2].map((page) => ({ kind: "image", page, x: 10, y: 10, w: 40, h: 20, image: "sig" })));
    const [ed] = await PROCESSORS["edit-pdf"]({ ...ctx([f], { overlays }), extras });
    for (const o of [wm, ed]) expect(await pagesOf(o.path)).toEqual([1, 2]);
  }, 30_000);

  it("reports a broken PNG as an unsupported image", async () => {
    const p = path.join(dir, "in", "broken.png");
    await writeFile(p, pngHeader(10, 10));
    const err = await toolError(PROCESSORS["jpg-to-pdf"](ctx([{ path: p, name: "broken.png" }], {})));
    expect(err.vars).toEqual({ file: "broken.png" });
  });

  it("rejects a PNG bomb in jpg-to-pdf before decoding it", async () => {
    const p = path.join(dir, "in", "bomb.png");
    await writeFile(p, pngHeader(20000, 20000));
    const started = Date.now();
    const err = await toolError(PROCESSORS["jpg-to-pdf"](ctx([{ path: p, name: "bomb.png" }], {})));
    expect(err.template).toBe(TOO_BIG);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe("office conversions", () => {
  const zip = Buffer.from("PK\x03\x04rest", "latin1");
  const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  const word = ["doc", "docx", "odt", "rtf", "txt"];

  it("accepts Office, OpenDocument and RTF files by content", () => {
    expect(checkOfficeFile(word, "a.docx", zip)).toBeUndefined();
    expect(checkOfficeFile(word, "a.doc", ole)).toBeUndefined();
    expect(checkOfficeFile(word, "a.rtf", Buffer.from("{\\rtf1"))).toBeUndefined();
  });

  it("imports plain text with a fixed filter, whatever it contains", () => {
    expect(checkOfficeFile(word, "a.txt", Buffer.from("<?xml"))).toBe("Text (encoded)");
    expect(checkOfficeFile(["csv"], "a.CSV", Buffer.from("a,b"))).toBe("Text - txt - csv (StarCalc)");
  });

  it("refuses HTML, flat XML and other formats LibreOffice could open", () => {
    const cases: [string, Buffer][] = [
      ["page.html", Buffer.from("<html>")],
      ["page.docx", Buffer.from("<html>")],
      ["flat.doc", Buffer.from("<?xml ")],
      ["image.docx", Buffer.from([0x89, 0x50, 0x4e, 0x47])],
      ["sheet.xlsx", zip],
    ];
    for (const [name, head] of cases) expect(() => checkOfficeFile(word, name, head)).toThrow(ToolError);
  });

  it("blocks linked content and macros in the LibreOffice profile", async () => {
    const profile = path.join(dir, "lo");
    await prepareLibreOfficeProfile(profile);
    const file = path.join(profile, "user", "registrymodifications.xcu");
    const xcu = await readFile(file, "utf8");
    expect(xcu).toContain('<prop oor:name="BlockUntrustedRefererLinks" oor:op="fuse"><value>true</value></prop>');
    expect(xcu).toContain('<prop oor:name="DisableMacrosExecution" oor:op="fuse"><value>true</value></prop>');
    // While our settings are there, whatever LibreOffice saved next to them is kept.
    await writeFile(file, xcu.replace("</oor:items>", "<item>kept</item></oor:items>"));
    await prepareLibreOfficeProfile(profile);
    expect(await readFile(file, "utf8")).toContain("<item>kept</item>");
  });
});

describe("output limits", () => {
  it("organize copies an image shared by repeated pages only once", async () => {
    const f = await pdfWithImage("img.pdf", 300_000);
    const pages = JSON.stringify(Array.from({ length: 40 }, () => ({ file: 0, page: 1 })));
    const [out] = await PROCESSORS["organize-pdf"](ctx([f], { pages }));
    expect((await PDFDocument.load(await readFile(out.path))).getPageCount()).toBe(40);
    expect((await stat(out.path)).size).toBeLessThan(2 * 300_000);
  });

  it("organize refuses far more pages than the documents have", async () => {
    const pages = JSON.stringify(Array.from({ length: 50_000 }, () => ({ file: 0, page: 1 })));
    const err = await toolError(PROCESSORS["organize-pdf"](ctx([await makePdf("a.pdf", 1)], { pages })));
    expect(err.template).toBe(TOO_MANY);
  });

  it("split refuses to write more files than the limit", async () => {
    const err = await toolError(PROCESSORS["split-pdf"](ctx([await makePdf("big.pdf", 1001)], { mode: "all" })));
    expect(err.template).toBe(TOO_MANY);
    const ranges = Array.from({ length: 3000 }, () => "1-3").join(",");
    const err2 = await toolError(PROCESSORS["split-pdf"](ctx([await makePdf("s.pdf", 3)], { mode: "custom", ranges })));
    expect(err2.template).toBe(TOO_MANY);
  }, 30_000);

  it("split stops when the results grow far beyond the upload", async () => {
    const f = await pdfWithImage("img.pdf", 4_000_000);
    // 100 pages sharing one 4 MB image: splitting them would write 400 MB.
    const pages = JSON.stringify(Array.from({ length: 100 }, () => ({ file: 0, page: 1 })));
    const [many] = await PROCESSORS["organize-pdf"](ctx([f], { pages }));
    const err = await toolError(PROCESSORS["split-pdf"](ctx([{ path: many.path, name: "many.pdf" }], { mode: "all" })));
    expect(err.template).toBe(TOO_BIG);
  }, 60_000);

  it("split by size makes chunks under the limit that cover every page", async () => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < 12; i++) {
      // Random text barely compresses, so each page adds tens of KB.
      doc.addPage([300, 300]).drawText(randomBytes(30_000).toString("base64"), { size: 4 });
    }
    const p = path.join(dir, "in", "text.pdf");
    await writeFile(p, await doc.save());
    const out = await PROCESSORS["split-pdf"](ctx([{ path: p, name: "text.pdf" }], { mode: "size", maxMb: "0.1" }));
    const covered: number[] = [];
    for (const o of out) {
      expect((await stat(o.path)).size).toBeLessThanOrEqual(0.1 * 1024 * 1024);
      covered.push(...(await pagesOf(o.path)));
    }
    expect(covered).toHaveLength(12);
    expect(out.length).toBeGreaterThan(1);
    expect(out.length).toBeLessThan(12);
  });
});
