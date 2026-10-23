import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ToolError } from "./engines";
import type { JobFile } from "./jobs";
import { PROCESSORS, type Ctx } from "./processors";

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
