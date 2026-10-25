// Every available tool in src/lib/tools.ts, run over HTTP with small fixtures:
// status, result metadata, the downloaded file's type and its page count.
import { PDFArray, PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { TOOLS } from "../../src/lib/tools";
import {
  baseHeaders,
  download,
  downloadOk,
  DOCX_TYPE,
  expectJsonError,
  isJpeg,
  isPdf,
  isZip,
  JPEG_BYTES,
  makeDocx,
  makeImagePdf,
  makePdf,
  makePng,
  makePptx,
  makeRotatedPdf,
  makeTablePdf,
  makeXlsx,
  pageCount,
  PDF_TYPE,
  pdfUpload,
  PPTX_TYPE,
  processOk,
  processRaw,
  unzip,
  url,
  XLSX_TYPE,
  ZIP_TYPE,
  type ProcessResult,
} from "./helpers";

let pdf1: Uint8Array;
let pdf3: Uint8Array;
let pdf2: Uint8Array;

beforeAll(async () => {
  pdf1 = await makePdf(1, "Single page");
  pdf2 = await makePdf(2, "Two pages");
  pdf3 = await makePdf(3, "Three pages");
});

/** Slugs exercised in this file; checked against tools.ts so a new tool cannot be forgotten. */
const COVERED = new Set<string>();
const cover = (slug: string) => {
  COVERED.add(slug);
  return slug;
};

async function zipEntries(r: ProcessResult) {
  const bytes = await downloadOk(r, ZIP_TYPE);
  expect(isZip(bytes)).toBe(true);
  const zip = await unzip(bytes);
  return zip;
}

describe("Organize", () => {
  it("merge-pdf joins pages in upload order", async () => {
    const r = await processOk(cover("merge-pdf"), [pdfUpload(pdf2, "a.pdf"), pdfUpload(pdf3, "b.pdf")]);
    expect(r.fileName).toBe("workify_merged.pdf");
    expect(r.count).toBe(1);
    expect(r.continuable).toBe(true);
    const out = await downloadOk(r, PDF_TYPE);
    expect(await pageCount(out)).toBe(5);
  });

  it("merge-pdf applies per-file rotations", async () => {
    const r = await processOk("merge-pdf", [pdfUpload(pdf1, "a.pdf"), pdfUpload(pdf1, "b.pdf")], { rotations: { 1: 90 } });
    const doc = await PDFDocument.load(await downloadOk(r, PDF_TYPE));
    expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual([0, 90]);
  });

  it("split-pdf custom ranges -> zip of one PDF per range", async () => {
    const r = await processOk(cover("split-pdf"), [pdfUpload(pdf3, "doc.pdf")], { mode: "custom", ranges: "1-2, 3" });
    expect(r.count).toBe(2);
    expect(r.fileName).toBe("workify_split-pdf.zip");
    expect(r.continuable).toBe(false);
    const zip = await zipEntries(r);
    const names = Object.keys(zip.files).sort();
    expect(names).toEqual(["doc_1-2.pdf", "doc_3.pdf"]);
    expect(await pageCount(await zip.file("doc_1-2.pdf")!.async("uint8array"))).toBe(2);
    expect(await pageCount(await zip.file("doc_3.pdf")!.async("uint8array"))).toBe(1);
  });

  it("split-pdf custom ranges merged into one PDF", async () => {
    const r = await processOk("split-pdf", [pdfUpload(pdf3, "doc.pdf")], { mode: "custom", ranges: "1, 3", mergeOutput: true });
    expect(r.count).toBe(1);
    expect(await pageCount(await downloadOk(r, PDF_TYPE))).toBe(2);
  });

  it("split-pdf fixed / all / select / size modes", async () => {
    const fixed = await processOk("split-pdf", [pdfUpload(pdf3)], { mode: "fixed", every: 2 });
    expect(fixed.count).toBe(2);
    const all = await processOk("split-pdf", [pdfUpload(pdf3)], { mode: "all" });
    expect(all.count).toBe(3);
    const select = await processOk("split-pdf", [pdfUpload(pdf3)], { mode: "select", pages: "2" });
    expect(select.count).toBe(1);
    expect(await pageCount(await downloadOk(select, PDF_TYPE))).toBe(1);
    const size = await processOk("split-pdf", [pdfUpload(pdf3)], { mode: "size", maxMb: 5 });
    expect(size.count).toBe(1); // a tiny file fits in one part
    expect(await pageCount(await downloadOk(size, PDF_TYPE))).toBe(3);
  });

  it("remove-pages drops the listed pages", async () => {
    const r = await processOk(cover("remove-pages"), [pdfUpload(pdf3, "doc.pdf")], { pages: "2" });
    expect(r.fileName).toBe("doc_pages_removed.pdf");
    expect(await pageCount(await downloadOk(r, PDF_TYPE))).toBe(2);
  });

  it("extract-pages keeps the listed pages, or saves them separately", async () => {
    const r = await processOk(cover("extract-pages"), [pdfUpload(pdf3, "doc.pdf")], { pages: "1,3" });
    expect(r.fileName).toBe("doc_extracted.pdf");
    expect(await pageCount(await downloadOk(r, PDF_TYPE))).toBe(2);
    const sep = await processOk("extract-pages", [pdfUpload(pdf3, "doc.pdf")], { pages: "1,3", separate: true });
    expect(sep.count).toBe(2);
    const zip = await zipEntries(sep);
    expect(Object.keys(zip.files).sort()).toEqual(["doc_page_1.pdf", "doc_page_3.pdf"]);
  });

  it("organize-pdf reorders, rotates and inserts blank pages across files", async () => {
    const pages = [
      { file: 1, page: 2 },
      { blank: true, width: 300, height: 400 },
      { file: 0, page: 1, rotate: 90 },
    ];
    const r = await processOk(cover("organize-pdf"), [pdfUpload(pdf1, "first.pdf"), pdfUpload(pdf2, "second.pdf")], { pages });
    expect(r.fileName).toBe("first_organized.pdf");
    const doc = await PDFDocument.load(await downloadOk(r, PDF_TYPE));
    expect(doc.getPageCount()).toBe(3);
    expect(doc.getPage(1).getSize()).toEqual({ width: 300, height: 400 });
    expect(doc.getPage(2).getRotation().angle).toBe(90);
  });

  it("scan-to-pdf turns camera images into one PDF", async () => {
    const r = await processOk(cover("scan-to-pdf"), [
      { name: "scan1.jpg", bytes: JPEG_BYTES, type: "image/jpeg" },
      { name: "scan2.png", bytes: makePng(), type: "image/png" },
    ]);
    expect(await pageCount(await downloadOk(r, PDF_TYPE))).toBe(2);
  });
});

describe("Optimize", () => {
  it("compress-pdf never returns a bigger file", async () => {
    for (const level of ["extreme", "recommended", "less"]) {
      const r = await processOk(cover("compress-pdf"), [pdfUpload(pdf3, "big.pdf")], { level });
      expect(r.fileName).toBe("big_compressed.pdf");
      expect(r.size).toBeLessThanOrEqual(r.inputSize);
      expect(await pageCount(await downloadOk(r, PDF_TYPE))).toBe(3);
    }
  });

  it("compress-pdf on several files -> zip", async () => {
    const r = await processOk("compress-pdf", [pdfUpload(pdf1, "a.pdf"), pdfUpload(pdf2, "b.pdf")]);
    expect(r.count).toBe(2);
    const zip = await zipEntries(r);
    expect(Object.keys(zip.files).sort()).toEqual(["a_compressed.pdf", "b_compressed.pdf"]);
  });

  it("repair-pdf recovers a PDF with a broken xref table", async () => {
    // Chop the xref/trailer off: readers must rebuild the object table.
    const text = Buffer.from(pdf2).toString("latin1");
    const broken = Buffer.from(text.slice(0, text.lastIndexOf("xref")) + "\n%%EOF\n", "latin1");
    const r = await processOk(cover("repair-pdf"), [pdfUpload(new Uint8Array(broken), "broken.pdf")]);
    expect(r.fileName).toBe("broken_repaired.pdf");
    expect(await pageCount(await downloadOk(r, PDF_TYPE))).toBe(2);
  });

  it("ocr-pdf makes an image-only PDF searchable (checked via PDF to Markdown)", async () => {
    // Text PDF -> page JPG -> image-only PDF -> OCR -> Markdown must contain the words.
    const textPdf = await makePdf(1, "OCR WORKIFY HELLO", { fontSize: 40 });
    const jpg = await processOk("pdf-to-jpg", [pdfUpload(textPdf, "t.pdf")], { mode: "pages", quality: "high" });
    const jpgBytes = (await download(jpg.downloadUrl)).bytes;
    const scanned = await processOk("jpg-to-pdf", [{ name: "page.jpg", bytes: jpgBytes, type: "image/jpeg" }], { size: "a4" });
    const scannedBytes = (await download(scanned.downloadUrl)).bytes;
    const r = await processOk(cover("ocr-pdf"), [pdfUpload(scannedBytes, "scan.pdf")], { language: "eng" });
    expect(r.fileName).toBe("scan_ocr.pdf");
    const ocred = await downloadOk(r, PDF_TYPE);
    expect(await pageCount(ocred)).toBe(1);
    const md = await processOk("pdf-to-markdown", [pdfUpload(ocred, "ocr.pdf")]);
    const text = Buffer.from((await download(md.downloadUrl)).bytes).toString("utf8");
    expect(text.toUpperCase()).toContain("WORKIFY");
  });

  it("ocr-pdf passes pages that already have text through (skip_text), keeping their text", async () => {
    const r = await processOk("ocr-pdf", [pdfUpload(pdf2, "text.pdf")], { language: "eng" });
    expect(r.fileName).toBe("text_ocr.pdf");
    const bytes = await downloadOk(r, PDF_TYPE);
    expect(await pageCount(bytes)).toBe(2);
    const md = await processOk("pdf-to-markdown", [pdfUpload(bytes, "t.pdf")]);
    expect(Buffer.from((await download(md.downloadUrl)).bytes).toString("utf8")).toContain("Two pages");
  });
});

describe("Convert from PDF", () => {
  it("pdf-to-word -> DOCX with the text", async () => {
    const r = await processOk(cover("pdf-to-word"), [pdfUpload(pdf2, "letter.pdf")]);
    expect(r.fileName).toBe("letter.docx");
    const bytes = await downloadOk(r, DOCX_TYPE);
    const zip = await unzip(bytes);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("Two pages");
  });

  it("pdf-to-powerpoint -> PPTX with one slide per page", async () => {
    const r = await processOk(cover("pdf-to-powerpoint"), [pdfUpload(pdf2, "deck.pdf")]);
    expect(r.fileName).toBe("deck.pptx");
    const zip = await unzip(await downloadOk(r, PPTX_TYPE));
    const slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
    expect(slides).toHaveLength(2);
  });

  it("pdf-to-excel -> XLSX with the table cells", async () => {
    const r = await processOk(cover("pdf-to-excel"), [pdfUpload(await makeTablePdf(), "table.pdf")]);
    expect(r.fileName).toBe("table.xlsx");
    const zip = await unzip(await downloadOk(r, XLSX_TYPE));
    const all = (await Promise.all(Object.values(zip.files).filter((f) => f.name.endsWith(".xml")).map((f) => f.async("string")))).join("");
    expect(all).toContain("Apple");
    expect(all).toContain("Page 1");
  });

  it("pdf-to-markdown -> .md text", async () => {
    const r = await processOk(cover("pdf-to-markdown"), [pdfUpload(pdf2, "notes.pdf")]);
    expect(r.fileName).toBe("notes.md");
    const bytes = await downloadOk(r, "text/markdown; charset=utf-8");
    const md = Buffer.from(bytes).toString("utf8");
    expect(md).toContain("Two pages");
  });

  it("pdf-to-jpg pages: one page -> single JPG, many -> zip of JPGs", async () => {
    const one = await processOk(cover("pdf-to-jpg"), [pdfUpload(pdf1, "one.pdf")], { mode: "pages", quality: "normal" });
    expect(one.fileName).toBe("one-001.jpg");
    expect(isJpeg(await downloadOk(one, "image/jpeg"))).toBe(true);
    const many = await processOk("pdf-to-jpg", [pdfUpload(pdf3, "three.pdf")], { mode: "pages" });
    expect(many.count).toBe(3);
    const zip = await zipEntries(many);
    expect(Object.keys(zip.files).sort()).toEqual(["three-001.jpg", "three-002.jpg", "three-003.jpg"]);
  });

  it("pdf-to-jpg extract mode pulls out embedded images", async () => {
    const r = await processOk("pdf-to-jpg", [pdfUpload(await makeImagePdf(), "pics.pdf")], { mode: "extract" });
    expect(r.count).toBe(1);
    expect(isJpeg(await downloadOk(r, "image/jpeg"))).toBe(true);
  });

  it("pdf-to-jpg extract mode on a PDF without images is a clean 400", async () => {
    await expectJsonError(processRaw("pdf-to-jpg", [pdfUpload(pdf1)], { mode: "extract" }), 400, "No images");
  });

  it("pdf-to-pdfa writes PDF/A identification metadata", async () => {
    for (const conformance of ["1", "2", "3"]) {
      const r = await processOk(cover("pdf-to-pdfa"), [pdfUpload(pdf1, "archive.pdf")], { conformance });
      expect(r.fileName).toBe("archive_pdfa.pdf");
      const bytes = await downloadOk(r, PDF_TYPE);
      const text = Buffer.from(bytes).toString("latin1");
      // Ghostscript writes the XMP attribute form with single quotes: pdfaid:part='2'.
      expect(text).toMatch(new RegExp(`pdfaid:part(>|=["'])${conformance}`));
      expect(await pageCount(bytes)).toBe(1);
    }
  });
});

// BUG(pdfa-outputintent): expected PDF to PDF/A output to carry an
// /OutputIntents entry (GTS_PDFA1 with an embedded ICC profile), which PDF/A
// requires whenever device colour spaces (DeviceRGB/DeviceGray) are used.
// Actual: src/server/processors.ts runs Ghostscript with -dPDFA but no
// PDFA_def.ps / ICC profile, so the file is only labelled PDF/A (XMP
// pdfaid:part) and the catalog has no OutputIntents; validators such as veraPDF
// reject it. Fix: pass a PDFA_def.ps that sets an sRGB OutputIntent.
describe("pdf-to-pdfa compliance", () => {
  it("the catalog has a GTS_PDFA1 OutputIntent", async () => {
    for (const conformance of ["1", "2", "3"]) {
      const r = await processOk("pdf-to-pdfa", [pdfUpload(pdf1, "archive.pdf")], { conformance });
      const doc = await PDFDocument.load(await downloadOk(r, PDF_TYPE));
      const intents = doc.catalog.lookup(PDFName.of("OutputIntents"), PDFArray);
      expect(intents?.size() ?? 0).toBeGreaterThan(0);
      const first = intents!.lookup(0, PDFDict);
      expect(first.get(PDFName.of("S"))?.toString()).toBe("/GTS_PDFA1");
      expect(first.get(PDFName.of("DestOutputProfile"))).toBeDefined();
    }
  });
});

describe("Convert to PDF", () => {
  it("jpg-to-pdf: JPG + PNG merged, fit size", async () => {
    const r = await processOk(cover("jpg-to-pdf"), [
      { name: "photo.jpg", bytes: JPEG_BYTES, type: "image/jpeg" },
      { name: "pic.png", bytes: makePng(40, 30), type: "image/png" },
    ]);
    expect(r.fileName).toBe("workify_images.pdf");
    const doc = await PDFDocument.load(await downloadOk(r, PDF_TYPE));
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPage(0).getSize()).toEqual({ width: 64, height: 48 });
    expect(doc.getPage(1).getSize()).toEqual({ width: 40, height: 30 });
  });

  it("jpg-to-pdf: A4 landscape with margins, one PDF per image", async () => {
    const r = await processOk(
      "jpg-to-pdf",
      [
        { name: "a.jpg", bytes: JPEG_BYTES, type: "image/jpeg" },
        { name: "b.jpg", bytes: JPEG_BYTES, type: "image/jpeg" },
      ],
      { size: "a4", orientation: "landscape", margin: "big", merge: false },
    );
    expect(r.count).toBe(2);
    const zip = await zipEntries(r);
    expect(Object.keys(zip.files).sort()).toEqual(["a.pdf", "b.pdf"]);
    const a = await PDFDocument.load(await zip.file("a.pdf")!.async("uint8array"));
    const { width, height } = a.getPage(0).getSize();
    expect(width).toBeGreaterThan(height);
  });

  it("word-to-pdf converts DOCX and TXT", async () => {
    const r = await processOk(cover("word-to-pdf"), [{ name: "memo.docx", bytes: await makeDocx(), type: "application/octet-stream" }]);
    expect(r.fileName).toBe("memo.pdf");
    const bytes = await downloadOk(r, PDF_TYPE);
    expect(isPdf(bytes)).toBe(true);
    expect(await pageCount(bytes)).toBe(1);
    const txt = await processOk("word-to-pdf", [{ name: "plain.txt", bytes: new TextEncoder().encode("Plain text line\n"), type: "text/plain" }]);
    expect(await pageCount(await downloadOk(txt, PDF_TYPE))).toBeGreaterThanOrEqual(1);
  });

  it("powerpoint-to-pdf converts a one-slide PPTX to one page", async () => {
    const r = await processOk(cover("powerpoint-to-pdf"), [{ name: "slides.pptx", bytes: await makePptx(), type: "application/octet-stream" }]);
    expect(r.fileName).toBe("slides.pdf");
    expect(await pageCount(await downloadOk(r, PDF_TYPE))).toBe(1);
  });

  it("excel-to-pdf converts XLSX and CSV", async () => {
    const r = await processOk(cover("excel-to-pdf"), [{ name: "book.xlsx", bytes: await makeXlsx(), type: "application/octet-stream" }]);
    expect(r.fileName).toBe("book.pdf");
    expect(await pageCount(await downloadOk(r, PDF_TYPE))).toBeGreaterThanOrEqual(1);
    const csv = await processOk("excel-to-pdf", [{ name: "data.csv", bytes: new TextEncoder().encode("a,b\n1,2\n"), type: "text/csv" }]);
    expect(await pageCount(await downloadOk(csv, PDF_TYPE))).toBeGreaterThanOrEqual(1);
  });

  it("html-to-pdf refuses local and private addresses (SSRF guard)", async () => {
    cover("html-to-pdf");
    for (const target of ["http://127.0.0.1:3100/api/health", "http://169.254.169.254/latest/meta-data/", "http://localhost/", "http://[::1]/", "http://10.0.0.1/"]) {
      await expectJsonError(processRaw("html-to-pdf", [], { url: target }), 400, "Private and local network");
    }
    await expectJsonError(processRaw("html-to-pdf", [], { url: "file:///etc/passwd" }), 400, "Only http and https");
    await expectJsonError(processRaw("html-to-pdf", [], { url: "javascript:alert(1)" }), 400, "Only http and https");
  });

  it("html-to-pdf converts a public page (skipped result when offline)", async () => {
    const { res, body, text } = await processRaw("html-to-pdf", [], { url: "https://example.com", pageSize: "A4" });
    if (res.status !== 200) {
      // Offline CI or no browser: the error must still be clean JSON.
      expect([400, 503]).toContain(res.status);
      expect(typeof (body as { error: string }).error).toBe("string");
      console.warn(`html-to-pdf could not convert example.com: ${text.slice(0, 200)}`);
      return;
    }
    const r = body as ProcessResult;
    expect(r.fileName).toBe("example.com.pdf");
    expect(await pageCount(await downloadOk(r, PDF_TYPE))).toBeGreaterThanOrEqual(1);
  });
});

describe("Edit", () => {
  it("edit-pdf draws text, shapes, lines, paths and images", async () => {
    const overlays = [
      { kind: "text", page: 1, x: 50, y: 500, text: "Edited\nline two", size: 18, color: "#ff0000", font: "Helvetica", bold: true },
      { kind: "rect", page: 1, x: 40, y: 400, w: 100, h: 50, stroke: "#000000", fill: "#00ff00", strokeWidth: 2 },
      { kind: "ellipse", page: 2, x: 40, y: 300, w: 80, h: 40, stroke: "#0000ff", strokeWidth: 1 },
      { kind: "line", page: 2, x1: 0, y1: 0, x2: 100, y2: 100, stroke: "#333333", strokeWidth: 3 },
      { kind: "path", page: 1, points: [[10, 10], [20, 30], [40, 15]], stroke: "#123456", strokeWidth: 2 },
      { kind: "image", page: 1, x: 300, y: 300, w: 64, h: 48, image: "img1" },
    ];
    const r = await processOk(cover("edit-pdf"), [pdfUpload(pdf2, "e.pdf")], { overlays }, { img1: { name: "i.png", bytes: makePng(), type: "image/png" } });
    expect(r.fileName).toBe("e_edited.pdf");
    expect(await pageCount(await downloadOk(r, PDF_TYPE))).toBe(2);
  });

  it("add-watermark text: every page, mosaic, below layer", async () => {
    const r = await processOk(cover("add-watermark"), [pdfUpload(pdf2, "w.pdf")], {
      kind: "text", text: "CONFIDENTIAL", fontSize: 40, font: "TimesRoman", bold: true, color: "#ff0000",
      position: "mc", mosaic: true, opacity: "0.25", rotation: "45", layer: "below", pages: "all",
    });
    expect(r.fileName).toBe("w_watermarked.pdf");
    expect(await pageCount(await downloadOk(r, PDF_TYPE))).toBe(2);
  });

  it("add-watermark image with extra:image upload", async () => {
    const r = await processOk("add-watermark", [pdfUpload(pdf1, "w.pdf")], { kind: "image", position: "tr", pages: "1" }, {
      image: { name: "logo.png", bytes: makePng(80, 40), type: "image/png" },
    });
    expect(await pageCount(await downloadOk(r, PDF_TYPE))).toBe(1);
  });

  it("add-watermark image without the image is a clean 400", async () => {
    await expectJsonError(processRaw("add-watermark", [pdfUpload(pdf1)], { kind: "image" }), 400, "Choose an image");
  });

  it("add-page-numbers keeps pages and supports custom formats", async () => {
    const r = await processOk(cover("add-page-numbers"), [pdfUpload(pdf3, "n.pdf")], {
      pageMode: "facing", position: "br", margin: "big", firstNumber: 5, fromPage: 2, toPage: 0,
      format: "custom", customFormat: "{n} / {p}", fontSize: 10, font: "Courier", color: "#333333",
    });
    expect(r.fileName).toBe("n_numbered.pdf");
    expect(await pageCount(await downloadOk(r, PDF_TYPE))).toBe(3);
  });

  it("rotate-pdf adds rotation per file and per page", async () => {
    const r = await processOk(cover("rotate-pdf"), [pdfUpload(pdf2, "r.pdf")], { rotations: { 0: { all: 90, pages: { 2: 90 } } } });
    expect(r.fileName).toBe("r_rotated.pdf");
    const doc = await PDFDocument.load(await downloadOk(r, PDF_TYPE));
    expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual([90, 180]);
  });

  it("rotate-pdf keeps existing rotation in [0, 360)", async () => {
    const r = await processOk("rotate-pdf", [pdfUpload(await makeRotatedPdf(270), "r.pdf")], { rotations: { 0: { all: 180 } } });
    const doc = await PDFDocument.load(await downloadOk(r, PDF_TYPE));
    expect(doc.getPage(0).getRotation().angle).toBe(90);
  });

  it("crop-pdf sets the crop box on every page or the current one", async () => {
    const r = await processOk(cover("crop-pdf"), [pdfUpload(pdf2, "c.pdf")], { box: { x: 10, y: 20, width: 300, height: 400 }, apply: "all" });
    expect(r.fileName).toBe("c_cropped.pdf");
    const doc = await PDFDocument.load(await downloadOk(r, PDF_TYPE));
    for (const p of doc.getPages()) expect(p.getCropBox()).toEqual({ x: 10, y: 20, width: 300, height: 400 });
    const one = await processOk("crop-pdf", [pdfUpload(pdf2, "c.pdf")], { box: { x: 0, y: 0, width: 100, height: 100 }, apply: "current", page: 2 });
    const d2 = await PDFDocument.load(await downloadOk(one, PDF_TYPE));
    expect(d2.getPage(0).getCropBox()).toEqual({ x: 0, y: 0, width: 595, height: 842 });
    expect(d2.getPage(1).getCropBox()).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });

  it("pdf-forms creates fields, fills them and can flatten", async () => {
    const spec = {
      create: [
        { page: 1, kind: "text", name: "full_name", x: 50, y: 600, w: 200, h: 20 },
        { page: 1, kind: "checkbox", name: "agree", x: 50, y: 560, w: 15, h: 15 },
      ],
      fill: {},
    };
    const r = await processOk(cover("pdf-forms"), [pdfUpload(pdf1, "f.pdf")], { form: spec });
    expect(r.fileName).toBe("f_form.pdf");
    const created = await downloadOk(r, PDF_TYPE);
    const doc = await PDFDocument.load(created);
    expect(doc.getForm().getFields().map((f) => f.getName()).sort()).toEqual(["agree", "full_name"]);

    const filled = await processOk("pdf-forms", [pdfUpload(created, "f.pdf")], { form: { create: [], fill: { full_name: "Ada Lovelace", agree: true } } });
    const fdoc = await PDFDocument.load(await downloadOk(filled, PDF_TYPE));
    expect(fdoc.getForm().getTextField("full_name").getText()).toBe("Ada Lovelace");
    expect(fdoc.getForm().getCheckBox("agree").isChecked()).toBe(true);

    const flat = await processOk("pdf-forms", [pdfUpload(created, "f.pdf")], { form: { create: [], fill: { full_name: "X" }, flatten: true } });
    const flatDoc = await PDFDocument.load(await downloadOk(flat, PDF_TYPE));
    expect(flatDoc.getForm().getFields()).toHaveLength(0);
  });
});

describe("Security", () => {
  it("protect-pdf encrypts with AES-256 and unlock-pdf removes it again", async () => {
    const r = await processOk(cover("protect-pdf"), [pdfUpload(pdf2, "secret.pdf")], { password: "s3cret pass", repeat: "s3cret pass" });
    expect(r.fileName).toBe("secret_protected.pdf");
    const locked = await downloadOk(r, PDF_TYPE);
    const doc = await PDFDocument.load(locked, { ignoreEncryption: true });
    expect(doc.isEncrypted).toBe(true);
    await expect(PDFDocument.load(locked)).rejects.toThrow(/encrypted/i);

    // Wrong password: clean error naming the file.
    await expectJsonError(processRaw("unlock-pdf", [pdfUpload(locked, "secret.pdf")], { password: "nope" }), 400, "needs its password");

    const u = await processOk(cover("unlock-pdf"), [pdfUpload(locked, "secret.pdf")], { password: "s3cret pass" });
    expect(u.fileName).toBe("secret_unlocked.pdf");
    const open = await downloadOk(u, PDF_TYPE);
    const plain = await PDFDocument.load(open);
    expect(plain.isEncrypted).toBe(false);
    expect(plain.getPageCount()).toBe(2);
  });

  it("protect-pdf refuses mismatched, empty, too long and multi-line passwords", async () => {
    await expectJsonError(processRaw("protect-pdf", [pdfUpload(pdf1)], { password: "a", repeat: "b" }), 400, "do not match");
    await expectJsonError(processRaw("protect-pdf", [pdfUpload(pdf1)], { password: "", repeat: "" }), 400, "Type a password");
    const long = "x".repeat(129);
    await expectJsonError(processRaw("protect-pdf", [pdfUpload(pdf1)], { password: long, repeat: long }), 400, "128");
    await expectJsonError(processRaw("protect-pdf", [pdfUpload(pdf1)], { password: "a\nb", repeat: "a\nb" }), 400, "line breaks");
  });

  it("unlock-pdf on an unencrypted PDF still returns the PDF", async () => {
    const u = await processOk("unlock-pdf", [pdfUpload(pdf1, "open.pdf")]);
    expect(await pageCount(await downloadOk(u, PDF_TYPE))).toBe(1);
  });

  it("redact-pdf removes searched text and drawn areas", async () => {
    const src = await makePdf(2, "Account number 12345678");
    const r = await processOk(cover("redact-pdf"), [pdfUpload(src, "bank.pdf")], {
      redactions: { terms: ["12345678"], areas: [{ page: 2, rect: [40, 740, 300, 790] }] },
    });
    expect(r.fileName).toBe("bank_redacted.pdf");
    const bytes = await downloadOk(r, PDF_TYPE);
    expect(await pageCount(bytes)).toBe(2);
    const md = await processOk("pdf-to-markdown", [pdfUpload(bytes, "red.pdf")]);
    const text = Buffer.from((await download(md.downloadUrl)).bytes).toString("utf8");
    expect(text).not.toContain("12345678");
    expect(text).toContain("Account number");
  });

  it("redact-pdf with nothing to redact is a clean 400", async () => {
    await expectJsonError(processRaw("redact-pdf", [pdfUpload(pdf1)], { redactions: { terms: [], areas: [] } }), 400, "Nothing to redact");
  });

  it("sign-pdf places a drawn signature image and typed name", async () => {
    const overlays = [
      { kind: "image", page: 1, x: 350, y: 80, w: 160, h: 60, image: "sig0" },
      { kind: "text", page: 1, x: 350, y: 60, text: "Ada Lovelace", size: 12, color: "#000000", font: "Helvetica" },
    ];
    const r = await processOk(cover("sign-pdf"), [pdfUpload(pdf1, "contract.pdf")], { overlays }, { sig0: { name: "sig.png", bytes: makePng(160, 60, [0, 0, 0]), type: "image/png" } });
    expect(r.fileName).toBe("contract_signed.pdf");
    expect(await pageCount(await downloadOk(r, PDF_TYPE))).toBe(1);
  });

  it("compare-pdf runs in the browser: the server answers with a clean 400", async () => {
    await expectJsonError(processRaw(cover("compare-pdf"), [pdfUpload(pdf1, "a.pdf"), pdfUpload(pdf2, "b.pdf")]), 400, "runs in your browser");
  });
});

describe("Workflows", () => {
  it("create-workflow chains steps and names the result <name>_workify.pdf", async () => {
    const steps = [
      { tool: "remove-pages", options: { pages: "3" } },
      { tool: "rotate-pdf", options: { angle: "180" } },
      { tool: "add-page-numbers", options: { format: "Page {n} of {p}" } },
      { tool: "add-watermark", options: { text: "DRAFT" } },
      { tool: "compress-pdf", options: { level: "recommended" } },
    ];
    const r = await processOk(cover("create-workflow"), [pdfUpload(pdf3, "report.pdf")], { steps });
    expect(r.fileName).toBe("report_workify.pdf");
    const doc = await PDFDocument.load(await downloadOk(r, PDF_TYPE));
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual([180, 180]);
  });

  it("create-workflow with protect as the last step gives an encrypted file", async () => {
    const steps = [{ tool: "extract-pages", options: { pages: "1" } }, { tool: "protect-pdf", options: { password: "pw", repeat: "pw" } }];
    const r = await processOk("create-workflow", [pdfUpload(pdf2, "a.pdf"), pdfUpload(pdf3, "b.pdf")], { steps });
    expect(r.count).toBe(2);
    const zip = await zipEntries(r);
    expect(Object.keys(zip.files).sort()).toEqual(["a_workify.pdf", "b_workify.pdf"]);
    const a = await PDFDocument.load(await zip.file("a_workify.pdf")!.async("uint8array"), { ignoreEncryption: true });
    expect(a.isEncrypted).toBe(true);
    expect(a.context.trailerInfo.Encrypt).toBeDefined();
  });

  it("create-workflow rejects unknown steps and more than 10 steps", async () => {
    await expectJsonError(processRaw("create-workflow", [pdfUpload(pdf1)], { steps: [{ tool: "pdf-to-word", options: {} }] }), 400, "cannot be used in a workflow");
    const many = Array.from({ length: 11 }, () => ({ tool: "repair-pdf", options: {} }));
    await expectJsonError(processRaw("create-workflow", [pdfUpload(pdf1)], { steps: many }), 400, "at most 10 steps");
    await expectJsonError(processRaw("create-workflow", [pdfUpload(pdf1)], { steps: [] }), 400, "at least one tool");
    await expectJsonError(processRaw("create-workflow", [pdfUpload(pdf1)], { steps: "not json" }), 400, "could not be read");
  });
});

describe("Unavailable tools", () => {
  for (const tool of TOOLS.filter((t) => t.unavailable)) {
    it(`${tool.slug} answers 503 with its notice before reading the upload`, async () => {
      cover(tool.slug);
      await expectJsonError(processRaw(tool.slug, [pdfUpload(pdf1)]), 503, tool.unavailable!);
    });
  }
});

describe("Downloads", () => {
  it("?inline=1 serves the file inline; DELETE /api/jobs removes it", async () => {
    const r = await processOk("merge-pdf", [pdfUpload(pdf1, "a.pdf"), pdfUpload(pdf1, "b.pdf")]);
    const inline = await download(r.downloadUrl, { inline: true });
    expect(inline.res.status).toBe(200);
    expect(inline.disposition).toMatch(/^inline;/);

    const del = await fetch(url(`/api/jobs/${r.jobId}`), { method: "DELETE", headers: baseHeaders() });
    expect(del.status).toBe(200);
    expect(await del.json()).toEqual({ ok: true });
    const gone = await download(r.downloadUrl);
    expect(gone.res.status).toBe(404);
    // Deleting again is idempotent: a well-formed job id that no longer exists still answers { ok: true }.
    const again = await fetch(url(`/api/jobs/${r.jobId}`), { method: "DELETE", headers: baseHeaders() });
    expect(again.status).toBe(200);
  });

  it("non-ASCII file names round-trip through the download URL", async () => {
    const r = await processOk("rotate-pdf", [pdfUpload(pdf1, "résumé 履歴書.pdf")], { rotations: { 0: { all: 90 } } });
    expect(r.fileName).toBe("résumé 履歴書_rotated.pdf");
    await downloadOk(r, PDF_TYPE);
  });
});

describe("coverage of src/lib/tools.ts", () => {
  it("every tool slug was exercised above", () => {
    const missing = TOOLS.map((t) => t.slug).filter((s) => !COVERED.has(s));
    expect(missing).toEqual([]);
  });
});
