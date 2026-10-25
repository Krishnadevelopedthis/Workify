import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream, degrees, type PDFPage } from "pdf-lib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TOOLS, WORKFLOW_STEPS } from "@/lib/tools";
import { ToolError } from "./engines";
import type { JobFile } from "./jobs";
import { PROCESSORS, type Ctx } from "./processors";

// In-process (pdf-lib) processors on small generated PDFs in a temp folder.

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "workify-unit-"));
  await mkdir(path.join(dir, "in"));
  await mkdir(path.join(dir, "out"));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

/** Page n is (100 + n) points wide so pages can be told apart afterwards. */
async function makePdf(name: string, pages: number, opts: { rotate?: number; base?: number } = {}): Promise<JobFile> {
  const doc = await PDFDocument.create();
  for (let i = 1; i <= pages; i++) {
    const p = doc.addPage([(opts.base ?? 100) + i, 200]);
    if (opts.rotate) p.setRotation(degrees(opts.rotate));
  }
  const p = path.join(dir, "in", name);
  await writeFile(p, await doc.save());
  return { path: p, name };
}

function ctx(inputs: JobFile[], opts: Record<string, string> = {}, extras: Ctx["extras"] = {}): Ctx {
  // A fresh job object per call: the output budget is tracked per job.
  return { job: { id: "unit", dir, inDir: path.join(dir, "in"), outDir: path.join(dir, "out") }, inputs, opts, extras };
}

const load = async (file: string) => PDFDocument.load(await readFile(file));
const widths = async (file: string) => (await load(file)).getPages().map((p) => p.getWidth());
const rotations = async (file: string) => (await load(file)).getPages().map((p) => p.getRotation().angle);

/** The text drawn on a page with pdf-lib's standard fonts (hex strings in Tj operators). */
function pageText(page: PDFPage): string {
  const contents = page.node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
  let out = "";
  for (const ref of refs) {
    const stream = page.doc.context.lookup(ref);
    let bytes: Uint8Array;
    if (stream instanceof PDFRawStream) bytes = decodePDFRawStream(stream).decode();
    else bytes = (stream as unknown as { getUnencodedContents(): Uint8Array }).getUnencodedContents();
    const src = Buffer.from(bytes).toString("latin1");
    for (const m of src.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)) out += `${Buffer.from(m[1], "hex").toString("latin1")}|`;
  }
  return out;
}

async function toolError(promise: Promise<unknown>): Promise<ToolError> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ToolError);
  return err as ToolError;
}

/** Any rejection, ToolError or not (a non-ToolError becomes a generic 500 for the user). */
async function rejection(promise: Promise<unknown>) {
  return promise.then(
    () => null,
    (e: unknown) => e,
  );
}

describe("processor registry", () => {
  it("has a processor for every available tool that is not handled elsewhere", () => {
    // HTML to PDF and workflows run in run-task.ts; Compare PDF runs in the browser.
    const special = new Set(["html-to-pdf", "create-workflow", "compare-pdf"]);
    for (const t of TOOLS) {
      if (t.unavailable || special.has(t.slug)) continue;
      expect(PROCESSORS[t.slug], t.slug).toBeTypeOf("function");
    }
  });

  it("only registers processors for real tools", () => {
    const slugs = new Set(TOOLS.map((t) => t.slug));
    for (const slug of Object.keys(PROCESSORS)) expect(slugs.has(slug), slug).toBe(true);
  });

  it("can run every workflow step", () => {
    for (const s of WORKFLOW_STEPS) expect(PROCESSORS[s], s).toBeTypeOf("function");
  });
});

describe("merge-pdf", () => {
  const merge = PROCESSORS["merge-pdf"];

  it("joins the files in upload order", async () => {
    const out = await merge(ctx([await makePdf("a.pdf", 2), await makePdf("b.pdf", 3, { base: 200 })]));
    expect(out).toEqual([{ path: path.join(dir, "out", "workify_merged.pdf"), name: "workify_merged.pdf" }]);
    expect(await widths(out[0].path)).toEqual([101, 102, 201, 202, 203]);
  });

  it("allows merging the same file twice and unicode names", async () => {
    const a = await makePdf("रिपोर्ट 😀.pdf", 1);
    const out = await merge(ctx([a, a]));
    expect(await widths(out[0].path)).toEqual([101, 101]);
  });

  it("applies extra rotations per input on top of existing ones", async () => {
    const out = await merge(ctx([await makePdf("a.pdf", 1, { rotate: 90 }), await makePdf("b.pdf", 2)], { rotations: JSON.stringify({ 0: 270, 1: 180 }) }));
    expect(await rotations(out[0].path)).toEqual([0, 180, 180]);
  });

  it.each([[[]], [[1]]])("needs at least two files (%#)", async (count) => {
    const inputs = await Promise.all((count as number[]).map((_, i) => makePdf(`${i}.pdf`, 1)));
    expect((await toolError(merge(ctx(inputs)))).message).toBe("Select at least 2 PDF files to merge.");
  });

  it("names the damaged file", async () => {
    const bad = path.join(dir, "in", "broken.pdf");
    await writeFile(bad, "not a pdf");
    const e = await toolError(merge(ctx([await makePdf("ok.pdf", 1), { path: bad, name: "broken.pdf" }])));
    expect(e.vars).toEqual({ file: "broken.pdf" });
  });

  it("refuses unreadable rotation settings with a readable error", async () => {
    const e = await toolError(merge(ctx([await makePdf("a.pdf", 1), await makePdf("b.pdf", 1)], { rotations: "{not json" })));
    expect(e.message).toMatch(/settings could not be read/);
  });

  // BUG(merge-rotation-normalise): expected merge to normalise rotations like
  // organize/rotate do (round to quarter turns, keep within 0..359); actual:
  // -90 is written as /Rotate -90, and 45 or "abc" make pdf-lib's setRotation
  // throw a plain Error, which the user sees as a generic processing failure.
  it("normalises odd rotation values instead of failing", async () => {
    const inputs = [await makePdf("a.pdf", 1), await makePdf("b.pdf", 1)];
    const neg = await merge(ctx(inputs, { rotations: JSON.stringify({ 0: -90 }) }));
    expect(await rotations(neg[0].path)).toEqual([270, 0]);
    await rm(neg[0].path);
    const odd = await rejection(merge(ctx(inputs, { rotations: JSON.stringify({ 0: 45, 1: "abc" }) })));
    expect(odd === null || odd instanceof ToolError).toBe(true);
  });
});

describe("rotate-pdf", () => {
  const rotate = PROCESSORS["rotate-pdf"];

  it("rotates every page of each file and single pages on top", async () => {
    const out = await rotate(
      ctx([await makePdf("a.pdf", 3), await makePdf("b.pdf", 1, { rotate: 90 })], {
        rotations: JSON.stringify({ 0: { all: 90, pages: { 2: 90, 3: -90 } }, 1: { all: 270 } }),
      }),
    );
    expect(out.map((o) => o.name)).toEqual(["a_rotated.pdf", "b_rotated.pdf"]);
    expect(await rotations(out[0].path)).toEqual([90, 180, 0]);
    expect(await rotations(out[1].path)).toEqual([0]);
  });

  it("keeps angles in 0..359 for negative and multi-turn rotations", async () => {
    const out = await rotate(ctx([await makePdf("a.pdf", 2)], { rotations: JSON.stringify({ 0: { pages: { 1: -450, 2: 720 } } }) }));
    expect(await rotations(out[0].path)).toEqual([270, 0]);
  });

  it("returns the file unchanged without settings", async () => {
    const out = await rotate(ctx([await makePdf("a.pdf", 2)]));
    expect(await rotations(out[0].path)).toEqual([0, 0]);
    expect(await widths(out[0].path)).toEqual([101, 102]);
  });

  it("ignores rotations for pages that do not exist", async () => {
    const out = await rotate(ctx([await makePdf("a.pdf", 1)], { rotations: JSON.stringify({ 5: { all: 90 }, 0: { pages: { 99: 90, 0: 90 } } }) }));
    expect(await rotations(out[0].path)).toEqual([0]);
  });

  // BUG(rotate-string-angle): expected {"all":"90"} (a string, as API users and
  // form posts send it) to rotate by 90; actual: "90" + 0 concatenates to "900",
  // so the page is turned 180 degrees.
  it("treats numeric strings as numbers", async () => {
    const out = await rotate(ctx([await makePdf("a.pdf", 1)], { rotations: JSON.stringify({ 0: { all: "90" } }) }));
    expect(await rotations(out[0].path)).toEqual([90]);
  });

  // BUG(rotate-non-quarter): expected a rotation that is not a multiple of 90
  // (e.g. 45) to be rounded or refused with a ToolError; actual: pdf-lib's
  // setRotation throws a plain assertion Error (generic 500 for the user).
  it("handles angles that are not quarter turns", async () => {
    const err = await rejection(rotate(ctx([await makePdf("a.pdf", 1)], { rotations: JSON.stringify({ 0: { all: 45 } }) })));
    expect(err === null || err instanceof ToolError).toBe(true);
  });
});

describe("add-watermark (text)", () => {
  const watermark = PROCESSORS["add-watermark"];

  it("stamps the text on every page by default", async () => {
    const out = await watermark(ctx([await makePdf("doc.pdf", 3)], { text: "CONFIDENTIAL" }));
    expect(out[0].name).toBe("doc_watermarked.pdf");
    const doc = await load(out[0].path);
    for (const p of doc.getPages()) expect(pageText(p)).toContain("CONFIDENTIAL");
  });

  it("only stamps the chosen pages", async () => {
    const out = await watermark(ctx([await makePdf("doc.pdf", 4)], { text: "DRAFT", pages: "2-3" }));
    const doc = await load(out[0].path);
    expect(doc.getPages().map((p) => pageText(p).includes("DRAFT"))).toEqual([false, true, true, false]);
  });

  it("tiles the text in mosaic mode", async () => {
    const out = await watermark(ctx([await makePdf("doc.pdf", 1)], { text: "X", mosaic: "true", fontSize: "6" }));
    const stamps = pageText((await load(out[0].path)).getPage(0)).split("|").filter(Boolean);
    expect(stamps.length).toBeGreaterThan(1);
  });

  it("puts the watermark under the page content when asked", async () => {
    const out = await watermark(ctx([await makePdf("doc.pdf", 1)], { text: "BELOW", layer: "below" }));
    const page = (await load(out[0].path)).getPage(0);
    expect(pageText(page)).toContain("BELOW");
  });

  it("replaces characters the standard fonts cannot draw instead of crashing", async () => {
    const out = await watermark(ctx([await makePdf("doc.pdf", 1)], { text: "गोपनीय 😀 OK" }));
    const text = pageText((await load(out[0].path)).getPage(0));
    expect(text).toContain("OK");
    expect(text).toContain("?");
  });

  it.each([[""], ["   "], [undefined]])("requires some text (%j)", async (text) => {
    const opts: Record<string, string> = text === undefined ? {} : { text };
    expect((await toolError(watermark(ctx([await makePdf("doc.pdf", 1)], opts)))).message).toBe("Type the watermark text.");
  });

  it("requires an image in image mode", async () => {
    expect((await toolError(watermark(ctx([await makePdf("doc.pdf", 1)], { kind: "image" })))).message).toBe("Choose an image for the watermark.");
  });

  it("clamps out-of-range numbers instead of failing", async () => {
    const out = await watermark(
      ctx([await makePdf("doc.pdf", 1)], { text: "T", opacity: "-5", fontSize: "100000", rotation: "NaN", color: "red", position: "zz" }),
    );
    expect(pageText((await load(out[0].path)).getPage(0))).toContain("T");
  });

  it("rejects page selections outside the document", async () => {
    await toolError(watermark(ctx([await makePdf("doc.pdf", 2)], { text: "T", pages: "5" })));
  });
});

describe("add-page-numbers", () => {
  const numbers = PROCESSORS["add-page-numbers"];
  const textsOf = async (file: string) => (await load(file)).getPages().map((p) => pageText(p).replace(/\|$/, ""));

  it("numbers every page from 1", async () => {
    const out = await numbers(ctx([await makePdf("doc.pdf", 3)]));
    expect(out[0].name).toBe("doc_numbered.pdf");
    expect(await textsOf(out[0].path)).toEqual(["1", "2", "3"]);
  });

  it("supports a page range, a first number and the total in custom formats", async () => {
    const out = await numbers(
      ctx([await makePdf("doc.pdf", 5)], { fromPage: "2", toPage: "4", firstNumber: "10", format: "custom", customFormat: "Page {n} of {p}" }),
    );
    expect(await textsOf(out[0].path)).toEqual(["", "Page 10 of 12", "Page 11 of 12", "Page 12 of 12", ""]);
  });

  it("clamps the range to the document", async () => {
    const out = await numbers(ctx([await makePdf("doc.pdf", 2)], { fromPage: "-3", toPage: "99" }));
    expect(await textsOf(out[0].path)).toEqual(["1", "2"]);
  });

  it("draws nothing (but still succeeds) when the range is empty", async () => {
    const out = await numbers(ctx([await makePdf("doc.pdf", 2)], { fromPage: "5" }));
    expect(await textsOf(out[0].path)).toEqual(["", ""]);
  });

  it("clamps huge first numbers and cuts long formats", async () => {
    const out = await numbers(ctx([await makePdf("doc.pdf", 1)], { firstNumber: "1e12", format: "custom", customFormat: `${"x".repeat(300)}{n}` }));
    const [t] = await textsOf(out[0].path);
    expect(t.length).toBeLessThanOrEqual(100);
    expect(t).not.toContain("1000000000000");
  });

  it("mirrors left/right positions on even pages in facing mode", async () => {
    const out = await numbers(ctx([await makePdf("doc.pdf", 2)], { pageMode: "facing", position: "bl" }));
    // Both pages are numbered; the mirroring only moves the text.
    expect(await textsOf(out[0].path)).toEqual(["1", "2"]);
  });

  it("keeps unicode formats drawable", async () => {
    const out = await numbers(ctx([await makePdf("doc.pdf", 1)], { format: "custom", customFormat: "पृष्ठ {n}" }));
    expect((await textsOf(out[0].path))[0]).toMatch(/\?+ 1$/);
  });

  // BUG(page-numbers-fraction): expected fractional page numbers ("1.5") to be
  // rounded; actual: from = 1.5 so doc.getPage(0.5) is undefined and the tool
  // crashes with a TypeError (generic 500) instead of numbering the pages.
  it("rounds fractional page ranges", async () => {
    const out = await numbers(ctx([await makePdf("doc.pdf", 3)], { fromPage: "1.5" }));
    expect(await textsOf(out[0].path)).toEqual(["", "1", "2"]);
  });
});

describe("crop-pdf", () => {
  const crop = PROCESSORS["crop-pdf"];
  const box = JSON.stringify({ x: 10, y: 20, width: 50, height: 60 });

  it("sets the crop box on every page", async () => {
    const out = await crop(ctx([await makePdf("doc.pdf", 2)], { box }));
    for (const p of (await load(out[0].path)).getPages()) expect(p.getCropBox()).toEqual({ x: 10, y: 20, width: 50, height: 60 });
  });

  it("can crop only the current page, clamping the page number", async () => {
    const out = await crop(ctx([await makePdf("doc.pdf", 3)], { box, apply: "current", page: "99" }));
    const boxes = (await load(out[0].path)).getPages().map((p) => p.getCropBox().width);
    expect(boxes).toEqual([101, 102, 50]);
  });

  it.each([[undefined], ["null"], [JSON.stringify({ x: 0, y: 0, width: 2, height: 100 })], [JSON.stringify({ width: "abc", height: 50 })]])(
    "asks for a selection when the box is missing or too small (%j)",
    async (b) => {
      const opts: Record<string, string> = b === undefined ? {} : { box: b };
      expect((await toolError(crop(ctx([await makePdf("doc.pdf", 1)], opts)))).message).toBe("Select the area you want to keep.");
    },
  );
});

describe("organize-pdf", () => {
  const organize = PROCESSORS["organize-pdf"];

  it("reorders, repeats, rotates and mixes pages of several files, with blank pages", async () => {
    const a = await makePdf("a.pdf", 3);
    const b = await makePdf("b.pdf", 2, { base: 200 });
    const items = [{ file: 1, page: 2 }, { file: 0, page: 1, rotate: -90 }, { blank: true, width: 300, height: 400 }, { file: 0, page: 1 }];
    const out = await organize(ctx([a, b], { pages: JSON.stringify(items) }));
    expect(out[0].name).toBe("a_organized.pdf");
    expect(await widths(out[0].path)).toEqual([202, 101, 300, 101]);
    expect(await rotations(out[0].path)).toEqual([0, 270, 0, 0]);
  });

  it("skips references to pages or files that do not exist", async () => {
    const items = [{ file: 0, page: 0 }, { file: 0, page: 9 }, { file: 5, page: 1 }, { file: 0.5, page: 1 }, null, "x", { file: 0, page: 2 }];
    const out = await organize(ctx([await makePdf("a.pdf", 2)], { pages: JSON.stringify(items) }));
    expect(await widths(out[0].path)).toEqual([102]);
  });

  it("clamps blank page sizes", async () => {
    const out = await organize(ctx([await makePdf("a.pdf", 1)], { pages: JSON.stringify([{ blank: true, width: 1e9, height: -5 }]) }));
    const [p] = (await load(out[0].path)).getPages();
    expect(p.getWidth()).toBe(14400);
    expect(p.getHeight()).toBe(1);
  });

  it.each([[undefined], ["[]"], ['{"file":0}']])("needs at least one page (%j)", async (pages) => {
    const opts: Record<string, string> = pages === undefined ? {} : { pages };
    expect((await toolError(organize(ctx([await makePdf("a.pdf", 1)], opts)))).message).toMatch(/no pages left/);
  });
});

describe("split-pdf", () => {
  const split = PROCESSORS["split-pdf"];

  it("splits custom ranges in the user's order", async () => {
    const out = await split(ctx([await makePdf("doc.pdf", 5)], { mode: "custom", ranges: "4-5, 1" }));
    expect(out.map((o) => o.name)).toEqual(["doc_4-5.pdf", "doc_1.pdf"]);
    expect(await widths(out[0].path)).toEqual([104, 105]);
  });

  it("splits every n pages, with a shorter last part", async () => {
    const out = await split(ctx([await makePdf("doc.pdf", 5)], { mode: "fixed", every: "2" }));
    expect(out.map((o) => o.name)).toEqual(["doc_1-2.pdf", "doc_3-4.pdf", "doc_5.pdf"]);
  });

  it.each([["0"], ["-3"], ["abc"], ["1.9"]])("treats an every value of %j as at least one page", async (every) => {
    const out = await split(ctx([await makePdf("doc.pdf", 2)], { mode: "fixed", every }));
    expect(out).toHaveLength(2);
  });

  it("merges the chosen pages into one file when asked", async () => {
    const out = await split(ctx([await makePdf("doc.pdf", 4)], { mode: "select", pages: "3,1", mergeOutput: "true" }));
    expect(out.map((o) => o.name)).toEqual(["doc_extracted.pdf"]);
    expect(await widths(out[0].path)).toEqual([101, 103]);
  });

  it("splits every page into its own file", async () => {
    const out = await split(ctx([await makePdf("doc.pdf", 3)], { mode: "all" }));
    expect(out.map((o) => o.name)).toEqual(["doc_1.pdf", "doc_2.pdf", "doc_3.pdf"]);
  });
});

describe("protect-pdf / unlock-pdf input checks (before qpdf runs)", () => {
  const protect = PROCESSORS["protect-pdf"];

  it.each([
    [{}, "Type a password."],
    [{ password: "" , repeat: "" }, "Type a password."],
    [{ password: "a".repeat(129), repeat: "a".repeat(129) }, "Use a password of at most 128 characters."],
    [{ password: "secret", repeat: "Secret" }, "Passwords do not match."],
    [{ password: "line\nbreak", repeat: "line\nbreak" }, "Passwords cannot contain line breaks."],
    [{ password: "cr\rhere", repeat: "cr\rhere" }, "Passwords cannot contain line breaks."],
  ])("protect refuses %j", async (opts, message) => {
    expect((await toolError(protect(ctx([await makePdf("doc.pdf", 1)], opts as Record<string, string>)))).message).toBe(message);
  });

  it("unlock refuses passwords with line breaks, which would inject qpdf arguments", async () => {
    const e = await toolError(PROCESSORS["unlock-pdf"](ctx([await makePdf("doc.pdf", 1)], { password: "x\n--overlay\n/etc/passwd" })));
    expect(e.message).toBe("Passwords cannot contain line breaks.");
  });
});
