// Shared helpers for the HTTP integration suite (see vitest.integration.config.ts).
// Everything here talks to a running Workify server over HTTP; nothing imports
// server code, so the tests exercise exactly what a browser or API client sees.
import { deflateSync } from "node:zlib";
import JSZip from "jszip";
import { degrees, PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { expect } from "vitest";

export const BASE_URL = (process.env.BASE_URL ?? "http://127.0.0.1:3100").replace(/\/+$/, "");

export const url = (path: string) => `${BASE_URL}${path}`;

/**
 * A fresh client address per request. Without a trusted proxy the server keys
 * its per-client rate limits on X-Forwarded-For (see src/server/rate-limit.ts),
 * so a suite of ~100 uploads from one address would trip the 40-per-10-minutes
 * limit, and other agents/tests hitting the same dev server share the bucket.
 * The global limits still apply to every request.
 */
let ipCounter = Math.floor(Math.random() * 200);
export function fakeIp() {
  ipCounter = (ipCounter + 1) % 250;
  const r = () => Math.floor(Math.random() * 250) + 1;
  return `10.${r()}.${r()}.${ipCounter + 1}`;
}

export function baseHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { "x-forwarded-for": fakeIp(), "x-wf-lang": "en", ...extra };
}

export type Upload = { name: string; bytes: Uint8Array; type?: string };

export function form(files: Upload[], options?: Record<string, unknown> | string, extras: Record<string, Upload> = {}) {
  const fd = new FormData();
  for (const f of files) fd.append("files", new Blob([f.bytes as BlobPart], { type: f.type ?? "application/octet-stream" }), f.name);
  if (options !== undefined) fd.append("options", typeof options === "string" ? options : JSON.stringify(options));
  for (const [key, f] of Object.entries(extras)) {
    fd.append(`extra:${key}`, new Blob([f.bytes as BlobPart], { type: f.type ?? "application/octet-stream" }), f.name);
  }
  return fd;
}

export type ProcessResult = {
  jobId: string;
  fileName: string;
  size: number;
  inputSize: number;
  count: number;
  downloadUrl: string;
  continuable: boolean;
};

/** POST /api/process/{tool}. Returns the raw response plus parsed JSON. */
export async function processRaw(
  tool: string,
  files: Upload[],
  options?: Record<string, unknown> | string,
  extras: Record<string, Upload> = {},
  headers: Record<string, string> = {},
) {
  const res = await fetch(url(`/api/process/${tool}`), {
    method: "POST",
    headers: baseHeaders(headers),
    body: form(files, options, extras),
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { res, body, text };
}

/** Runs a tool and asserts success. */
export async function processOk(tool: string, files: Upload[], options?: Record<string, unknown>, extras: Record<string, Upload> = {}) {
  const { res, body, text } = await processRaw(tool, files, options, extras);
  if (res.status !== 200) throw new Error(`${tool}: expected 200, got ${res.status}: ${text.slice(0, 500)}`);
  const r = body as ProcessResult;
  expect(r.jobId).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(r.downloadUrl).toBe(`/api/download/${r.jobId}/${encodeURIComponent(r.fileName)}`);
  expect(r.size).toBeGreaterThan(0);
  expect(r.inputSize).toBe(files.reduce((s, f) => s + f.bytes.byteLength, 0));
  return r;
}

/** Asserts a clean JSON error: right status, `{ error: string }`, no stack traces or paths. */
export async function expectJsonError(
  p: Promise<{ res: Response; body: unknown; text: string }> | { res: Response; body: unknown; text: string },
  status: number,
  match?: RegExp | string,
) {
  const { res, body, text } = await p;
  expect(res.status, text.slice(0, 300)).toBe(status);
  expect(res.headers.get("content-type") ?? "").toMatch(/application\/json/);
  const err = (body as { error?: unknown }).error;
  expect(typeof err).toBe("string");
  const message = err as string;
  expect(message.length).toBeGreaterThan(0);
  expectNoLeak(message);
  if (match) {
    if (typeof match === "string") expect(message).toContain(match);
    else expect(message).toMatch(match);
  }
  return message;
}

/** Error text must never carry stack frames, server paths or library internals. */
export function expectNoLeak(text: string) {
  expect(text).not.toMatch(/\bat \S+ \(|node_modules|[A-Z]:\\|\/home\/|\/app\/|Traceback|TypeError|ReferenceError|SyntaxError: /);
}

export type Download = { res: Response; bytes: Uint8Array; type: string; disposition: string };

export async function download(downloadUrl: string, opts: { inline?: boolean } = {}): Promise<Download> {
  const res = await fetch(url(downloadUrl + (opts.inline ? "?inline=1" : "")), { headers: baseHeaders() });
  const bytes = new Uint8Array(await res.arrayBuffer());
  return {
    res,
    bytes,
    type: res.headers.get("content-type") ?? "",
    disposition: res.headers.get("content-disposition") ?? "",
  };
}

/** Downloads a result and checks status, content type, length and attachment name. */
export async function downloadOk(r: ProcessResult, type: string | RegExp): Promise<Uint8Array> {
  const d = await download(r.downloadUrl);
  expect(d.res.status).toBe(200);
  if (typeof type === "string") expect(d.type).toBe(type);
  else expect(d.type).toMatch(type);
  expect(Number(d.res.headers.get("content-length"))).toBe(r.size);
  expect(d.bytes.byteLength).toBe(r.size);
  expect(d.disposition).toBe(`attachment; filename*=UTF-8''${encodeURIComponent(r.fileName)}`);
  expect(d.res.headers.get("x-content-type-options")).toBe("nosniff");
  expect(d.res.headers.get("cache-control")).toMatch(/no-store/);
  return d.bytes;
}

export const PDF_TYPE = "application/pdf";
export const ZIP_TYPE = "application/zip";
export const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const PPTX_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export const isPdf = (b: Uint8Array) => Buffer.from(b.subarray(0, 5)).toString("latin1") === "%PDF-";
export const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
export const isJpeg = (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

export async function pageCount(bytes: Uint8Array) {
  return (await PDFDocument.load(bytes, { ignoreEncryption: true })).getPageCount();
}

export async function unzip(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  return zip;
}

// ---------- Fixtures ----------

/** A text PDF: `pages` pages, each saying "Page N" plus `text`. */
export async function makePdf(pages = 1, text = "Workify integration test", opts: { size?: [number, number]; fontSize?: number } = {}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const [w, h] = opts.size ?? [595, 842];
  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage([w, h]);
    page.drawText(`Page ${i}`, { x: 50, y: h - 80, size: opts.fontSize ?? 28, font, color: rgb(0, 0, 0) });
    page.drawText(text, { x: 50, y: h - 130, size: opts.fontSize ?? 20, font, color: rgb(0.1, 0.1, 0.1) });
  }
  return doc.save();
}

/** A PDF with a ruled 3x3 table (for PDF to Excel). */
export async function makeTablePdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  const rows = [["Item", "Qty", "Price"], ["Apple", "3", "1.50"], ["Pear", "5", "2.25"]];
  const x0 = 60, y0 = 700, cw = 120, rh = 30;
  for (let r = 0; r <= rows.length; r++) page.drawLine({ start: { x: x0, y: y0 - r * rh }, end: { x: x0 + 3 * cw, y: y0 - r * rh }, thickness: 1 });
  for (let c = 0; c <= 3; c++) page.drawLine({ start: { x: x0 + c * cw, y: y0 }, end: { x: x0 + c * cw, y: y0 - rows.length * rh }, thickness: 1 });
  rows.forEach((row, r) => row.forEach((cell, c) => page.drawText(cell, { x: x0 + c * cw + 8, y: y0 - r * rh - 20, size: 12, font })));
  return doc.save();
}

/** A PDF whose page has an existing rotation. */
export async function makeRotatedPdf(angle: number) {
  const doc = await PDFDocument.load(await makePdf(1));
  doc.getPage(0).setRotation(degrees(angle));
  return doc.save();
}

/** A PDF with an embedded image (for "Extract images"). */
export async function makeImagePdf() {
  const doc = await PDFDocument.create();
  const img = await doc.embedJpg(JPEG_BYTES);
  const page = doc.addPage([300, 300]);
  page.drawImage(img, { x: 20, y: 20, width: 256, height: 192 });
  return doc.save();
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** A small RGB PNG (a colored square with a darker frame). */
export function makePng(width = 40, height = 30, color: [number, number, number] = [30, 120, 220]): Uint8Array {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const edge = x < 3 || y < 3 || x >= width - 3 || y >= height - 3;
      const o = y * (width * 3 + 1) + 1 + x * 3;
      raw[o] = edge ? 10 : color[0];
      raw[o + 1] = edge ? 10 : color[1];
      raw[o + 2] = edge ? 10 : color[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return new Uint8Array(Buffer.concat([sig, pngChunk("IHDR", ihdr), pngChunk("IDAT", deflateSync(raw)), pngChunk("IEND", Buffer.alloc(0))]));
}

/** A 64x48 baseline JPEG (red with a blue box). */
export const JPEG_BYTES = new Uint8Array(
  Buffer.from(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAwAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDn6KKyr29uIbt0STCjGBtHpXPgsFUxtR06bSaV9f6fc+1xeLhhYKc07XtoatFYf9o3f/PX/wAdH+FH9o3f/PX/AMdH+Fet/q3i/wCaP3v/ACPO/t3Dfyy+5f5m5RWH/aN3/wA9f/HR/hWxAxe3jZjksgJP4V5+OyutgoqVRp37X/yR2YTMKWLk4wTVu/8Aw5JRRRXlnoBWHqP/AB/Sfh/IVuVjX8Ez3sjLE7A45Ck9hX0PD04wxUnJ291/mjxM7jKWHioq/vfoylRUv2a4/wCeEn/fBo+zXH/PCT/vg19v7el/MvvR8n7Gp/K/uIq6G2/49Yf9xf5Vh/Zrj/nhJ/3wa3bcFbaIEEEIAQfpXzPEdSE6UOVp6/oe/kcJxqT5lbQkooor40+oCiiigAooooAKKKKACiiigD//2Q==",
    "base64",
  ),
);

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const OFFICE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

async function zipOf(files: Record<string, string>) {
  const zip = new JSZip();
  // [Content_Types].xml first, as Office writes it.
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  return new Uint8Array(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
}

/** A minimal one-paragraph DOCX. */
export function makeDocx(text = "Hello from a Workify integration test") {
  return zipOf({
    "[Content_Types].xml": `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    "_rels/.rels": `${XML}<Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${OFFICE_REL}/officeDocument" Target="word/document.xml"/></Relationships>`,
    "word/document.xml": `${XML}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p><w:p><w:r><w:t>Second paragraph.</w:t></w:r></w:p></w:body></w:document>`,
  });
}

/** A minimal XLSX with a 3x3 sheet (inline strings). */
export function makeXlsx() {
  const rows = [["Item", "Qty"], ["Apple", 3], ["Pear", 5]];
  const sheetRows = rows
    .map((r, i) =>
      `<row r="${i + 1}">${r
        .map((v, j) => {
          const ref = `${String.fromCharCode(65 + j)}${i + 1}`;
          return typeof v === "number" ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${v}</t></is></c>`;
        })
        .join("")}</row>`,
    )
    .join("");
  return zipOf({
    "[Content_Types].xml": `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    "_rels/.rels": `${XML}<Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${OFFICE_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `${XML}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${OFFICE_REL}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `${XML}<Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${OFFICE_REL}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml": `${XML}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`,
  });
}

/** A minimal one-slide PPTX (master, layout and theme included, as PowerPoint requires). */
export function makePptx(title = "Workify slide") {
  const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
  const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
  const ct = (part: string, type: string) => `<Override PartName="${part}" ContentType="application/vnd.openxmlformats-officedocument.${type}"/>`;
  const emptyTree = `<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>`;
  const clr = (name: string, hex: string) => `<a:${name}><a:srgbClr val="${hex}"/></a:${name}>`;
  const font = `<a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/>`;
  const fill = `<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>`;
  const line = `<a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>`;
  const theme = `${XML}<a:theme xmlns:a="${A}" name="Office"><a:themeElements><a:clrScheme name="Office">${clr("dk1", "000000")}${clr("lt1", "FFFFFF")}${clr("dk2", "1F497D")}${clr("lt2", "EEECE1")}${clr("accent1", "4F81BD")}${clr("accent2", "C0504D")}${clr("accent3", "9BBB59")}${clr("accent4", "8064A2")}${clr("accent5", "4BACC6")}${clr("accent6", "F79646")}${clr("hlink", "0000FF")}${clr("folHlink", "800080")}</a:clrScheme><a:fontScheme name="Office"><a:majorFont>${font}</a:majorFont><a:minorFont>${font}</a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst>${fill}${fill}${fill}</a:fillStyleLst><a:lnStyleLst>${line}${line}${line}</a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst>${fill}${fill}${fill}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
  return zipOf({
    "[Content_Types].xml": `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${ct("/ppt/presentation.xml", "presentationml.presentation.main+xml")}${ct("/ppt/slides/slide1.xml", "presentationml.slide+xml")}${ct("/ppt/slideMasters/slideMaster1.xml", "presentationml.slideMaster+xml")}${ct("/ppt/slideLayouts/slideLayout1.xml", "presentationml.slideLayout+xml")}${ct("/ppt/theme/theme1.xml", "theme+xml")}</Types>`,
    "_rels/.rels": `${XML}<Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${OFFICE_REL}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`,
    "ppt/presentation.xml": `${XML}<p:presentation xmlns:a="${A}" xmlns:r="${OFFICE_REL}" xmlns:p="${P}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
    "ppt/_rels/presentation.xml.rels": `${XML}<Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${OFFICE_REL}/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="${OFFICE_REL}/slide" Target="slides/slide1.xml"/><Relationship Id="rId3" Type="${OFFICE_REL}/theme" Target="theme/theme1.xml"/></Relationships>`,
    "ppt/slideMasters/slideMaster1.xml": `${XML}<p:sldMaster xmlns:a="${A}" xmlns:r="${OFFICE_REL}" xmlns:p="${P}">${emptyTree}<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`,
    "ppt/slideMasters/_rels/slideMaster1.xml.rels": `${XML}<Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${OFFICE_REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${OFFICE_REL}/theme" Target="../theme/theme1.xml"/></Relationships>`,
    "ppt/slideLayouts/slideLayout1.xml": `${XML}<p:sldLayout xmlns:a="${A}" xmlns:r="${OFFICE_REL}" xmlns:p="${P}" type="blank">${emptyTree}<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`,
    "ppt/slideLayouts/_rels/slideLayout1.xml.rels": `${XML}<Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${OFFICE_REL}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`,
    "ppt/slides/slide1.xml": `${XML}<p:sld xmlns:a="${A}" xmlns:r="${OFFICE_REL}" xmlns:p="${P}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="7315200" cy="1371600"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="4000"/><a:t>${title}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`,
    "ppt/slides/_rels/slide1.xml.rels": `${XML}<Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${OFFICE_REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`,
    "ppt/theme/theme1.xml": theme,
  });
}

export const pdfUpload = (bytes: Uint8Array, name = "sample.pdf"): Upload => ({ name, bytes, type: PDF_TYPE });
