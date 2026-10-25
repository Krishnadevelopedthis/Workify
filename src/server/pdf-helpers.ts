import "server-only";
import { readFile } from "node:fs/promises";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { ToolError } from "./engines";

/** Far beyond real documents; a tiny file with thousands of page objects otherwise drives memory and run time up. */
export const MAX_PDF_PAGES = 10_000;

export async function loadPdf(filePath: string, name: string) {
  const bytes = await readFile(filePath);
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false });
    doc.getPageCount(); // a "%PDF-" header with junk after it only fails here
  } catch (e) {
    if (String(e).includes("encrypted")) {
      throw new ToolError('"{file}" is password protected. Unlock it first with Unlock PDF.', { file: name });
    }
    throw new ToolError('"{file}" is not a valid PDF or is damaged. Try Repair PDF first.', { file: name });
  }
  const pages = doc.getPageCount();
  if (pages > MAX_PDF_PAGES) {
    throw new ToolError('"{file}" has {pages} pages. Workify can process PDFs of up to {max} pages.', { file: name, pages, max: MAX_PDF_PAGES });
  }
  return doc;
}

export function hexToRgb(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0;
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const FONT_MAP: Record<string, [StandardFonts, StandardFonts]> = {
  Helvetica: [StandardFonts.Helvetica, StandardFonts.HelveticaBold],
  TimesRoman: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold],
  Courier: [StandardFonts.Courier, StandardFonts.CourierBold],
};

export function embedStandardFont(doc: PDFDocument, family: string, bold = false): Promise<PDFFont> {
  const pair = FONT_MAP[family] ?? FONT_MAP.Helvetica;
  return doc.embedFont(pair[bold ? 1 : 0]);
}

/** "1-3, 5, 8-" -> sorted unique 1-based page numbers within [1, total]. */
export function parsePageList(spec: string, total: number): number[] {
  const s = spec.trim().toLowerCase();
  if (!s || s === "all") return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set<number>();
  for (const part of s.split(",").map((p) => p.trim()).filter(Boolean)) {
    const m = /^(\d*)\s*-\s*(\d*)$/.exec(part);
    if (m) {
      const from = m[1] ? +m[1] : 1;
      const to = m[2] ? +m[2] : total;
      for (let p = Math.max(1, from); p <= Math.min(total, to); p++) pages.add(p);
    } else if (/^\d+$/.test(part)) {
      const p = +part;
      if (p >= 1 && p <= total) pages.add(p);
    } else {
      throw new ToolError('"{part}" is not a valid page or range.', { part });
    }
  }
  if (!pages.size) throw new ToolError('No pages match "{spec}". This PDF has {total} pages.', { spec, total });
  return [...pages].sort((a, b) => a - b);
}

/** "1-3, 4-6" -> [[1,3],[4,6]] keeping the user's order. */
export function parseRanges(spec: string, total: number): [number, number][] {
  const ranges: [number, number][] = [];
  for (const part of spec.split(",").map((p) => p.trim()).filter(Boolean)) {
    const m = /^(\d+)\s*(?:-\s*(\d+))?$/.exec(part);
    if (!m) throw new ToolError('"{part}" is not a valid range. Use a format like 1-3.', { part });
    const from = +m[1];
    const to = m[2] ? +m[2] : from;
    if (from < 1 || to > total || from > to) {
      throw new ToolError('Range "{part}" is outside this PDF\'s {total} pages.', { part, total });
    }
    ranges.push([from, to]);
  }
  if (!ranges.length) throw new ToolError("Enter at least one range.");
  return ranges;
}

/** Point for a 3x3 position code (tl, mc, br, ...) on a page of size w x h. */
export function anchor(
  pos: string,
  w: number,
  h: number,
  boxW: number,
  boxH: number,
  margin: number,
) {
  const col = pos[1] ?? "c";
  const row = pos[0] ?? "m";
  const x = col === "l" ? margin : col === "r" ? w - margin - boxW : (w - boxW) / 2;
  // PDF origin is bottom-left.
  const y = row === "t" ? h - margin - boxH : row === "b" ? margin : (h - boxH) / 2;
  return { x, y };
}

/**
 * Standard PDF fonts only cover Latin-1 (WinAnsi). Characters they cannot draw
 * (e.g. Devanagari, emoji) are replaced with "?" instead of crashing the tool.
 */
export function drawableText(font: PDFFont, text: string) {
  let out = "";
  for (const ch of text) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

/** A finite number clamped to [min, max], or the fallback. */
export function num(v: unknown, min: number, max: number, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export function baseName(name: string) {
  return name.replace(/\.[^.]+$/, "");
}
