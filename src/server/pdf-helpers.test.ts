import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ToolError } from "./engines";
import { anchor, baseName, drawableText, hexToRgb, loadPdf, num, parsePageList, parseRanges } from "./pdf-helpers";

/** Runs `fn` and returns the ToolError it throws. */
function toolError(fn: () => unknown): ToolError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ToolError);
    return e as ToolError;
  }
  throw new Error("expected a ToolError");
}

describe("parsePageList", () => {
  it("returns every page for an empty spec or 'all'", () => {
    expect(parsePageList("", 3)).toEqual([1, 2, 3]);
    expect(parsePageList("   ", 3)).toEqual([1, 2, 3]);
    expect(parsePageList("ALL", 3)).toEqual([1, 2, 3]);
  });

  it("parses single pages and ranges into sorted unique numbers", () => {
    expect(parsePageList("5, 1-3, 2", 10)).toEqual([1, 2, 3, 5]);
    expect(parsePageList(" 4 - 6 ", 10)).toEqual([4, 5, 6]);
    expect(parsePageList("1,,3,", 10)).toEqual([1, 3]);
  });

  it("supports open-ended ranges", () => {
    expect(parsePageList("8-", 10)).toEqual([8, 9, 10]);
    expect(parsePageList("-2", 10)).toEqual([1, 2]);
    expect(parsePageList("-", 3)).toEqual([1, 2, 3]);
  });

  it("clamps ranges to the document and drops out-of-range pages", () => {
    expect(parsePageList("0-2, 4-99", 5)).toEqual([1, 2, 4, 5]);
    expect(parsePageList("2, 7", 5)).toEqual([2]);
  });

  it("rejects malformed parts with a translatable template", () => {
    const e = toolError(() => parsePageList("1, abc", 5));
    expect(e.template).toBe('"{part}" is not a valid page or range.');
    expect(e.vars).toEqual({ part: "abc" });
    expect(e.message).toBe('"abc" is not a valid page or range.');
    expect(() => parsePageList("1-2-3", 5)).toThrow(ToolError);
    expect(() => parsePageList("1.5", 5)).toThrow(ToolError);
  });

  it("rejects specs that match no pages", () => {
    const e = toolError(() => parsePageList("6-9", 5));
    expect(e.template).toBe('No pages match "{spec}". This PDF has {total} pages.');
    expect(e.vars).toEqual({ spec: "6-9", total: 5 });
    expect(e.message).toBe('No pages match "6-9". This PDF has 5 pages.');
  });
});

describe("parseRanges", () => {
  it("keeps the user's order and allows overlaps", () => {
    expect(parseRanges("4-6, 1-3, 2", 6)).toEqual([
      [4, 6],
      [1, 3],
      [2, 2],
    ]);
    expect(parseRanges(" 1 - 2 ,", 2)).toEqual([[1, 2]]);
  });

  it("rejects malformed ranges", () => {
    for (const spec of ["a-b", "1-", "-3", "1-2-3"]) {
      const e = toolError(() => parseRanges(spec, 10));
      expect(e.template).toBe('"{part}" is not a valid range. Use a format like 1-3.');
      expect(e.vars).toEqual({ part: spec });
    }
  });

  it("rejects ranges outside the document or reversed", () => {
    for (const part of ["0-2", "3-11", "5-4", "11"]) {
      const e = toolError(() => parseRanges(part, 10));
      expect(e.template).toBe("Range \"{part}\" is outside this PDF's {total} pages.");
      expect(e.vars).toEqual({ part, total: 10 });
    }
  });

  it("requires at least one range", () => {
    for (const spec of ["", " , ,"]) {
      const e = toolError(() => parseRanges(spec, 10));
      expect(e.template).toBe("Enter at least one range.");
      expect(e.vars).toBeUndefined();
    }
  });
});

describe("small helpers", () => {
  it("num clamps finite numbers and falls back otherwise", () => {
    expect(num("12", 0, 10, 5)).toBe(10);
    expect(num(-3, 0, 10, 5)).toBe(0);
    expect(num("2.5", 0, 10, 5)).toBe(2.5);
    expect(num("abc", 0, 10, 5)).toBe(5);
    expect(num(undefined, 0, 10, 5)).toBe(5);
    expect(num(Infinity, 0, 10, 5)).toBe(5);
  });

  it("baseName strips only the last extension", () => {
    expect(baseName("report.final.pdf")).toBe("report.final");
    expect(baseName("README")).toBe("README");
  });

  it("hexToRgb parses #rrggbb with or without the hash and falls back to black", () => {
    expect(hexToRgb("#ff8000")).toMatchObject({ red: 1, green: 128 / 255, blue: 0 });
    expect(hexToRgb(" 00FF00 ")).toMatchObject({ red: 0, green: 1, blue: 0 });
    expect(hexToRgb("red")).toMatchObject({ red: 0, green: 0, blue: 0 });
  });

  it("anchor places a box on a 3x3 grid with a bottom-left origin", () => {
    expect(anchor("tl", 600, 800, 100, 50, 10)).toEqual({ x: 10, y: 740 });
    expect(anchor("mc", 600, 800, 100, 50, 10)).toEqual({ x: 250, y: 375 });
    expect(anchor("br", 600, 800, 100, 50, 10)).toEqual({ x: 490, y: 10 });
    expect(anchor("", 600, 800, 100, 50, 10)).toEqual({ x: 250, y: 375 });
  });

  it("drawableText replaces characters the standard fonts cannot encode", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    expect(drawableText(font, "Café 1")).toBe("Café 1");
    expect(drawableText(font, "नमस्ते A")).toBe("?????? A");
  });
});

describe("loadPdf", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "workify-helpers-"));
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it("loads a valid PDF", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.addPage();
    const file = path.join(dir, "ok.pdf");
    await writeFile(file, await doc.save());
    expect((await loadPdf(file, "ok.pdf")).getPageCount()).toBe(2);
  });

  it("reports a damaged file by name", async () => {
    const file = path.join(dir, "bad.pdf");
    await writeFile(file, "this is not a pdf");
    const err = await loadPdf(file, "bad.pdf").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ToolError);
    expect((err as ToolError).template).toBe('"{file}" is not a valid PDF or is damaged. Try Repair PDF first.');
    expect((err as ToolError).vars).toEqual({ file: "bad.pdf" });
  });

  it("reports a file with a PDF header but junk after it", async () => {
    const file = path.join(dir, "junk.pdf");
    await writeFile(file, "%PDF-1.7\nnot really a pdf");
    const err = await loadPdf(file, "junk.pdf").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ToolError);
    expect((err as ToolError).vars).toEqual({ file: "junk.pdf" });
  });
});
