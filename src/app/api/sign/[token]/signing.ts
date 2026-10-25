import { BlendMode, PDFDocument } from "pdf-lib";
import { applyOverlays, type Overlay } from "@/server/processors";

// Helpers for a signer's POST: one signature at a time per request, and only
// signature-like marks that cannot cover or change what is already on the page.

const LOCKS = Symbol.for("workify.signRequestLocks");
const store = globalThis as typeof globalThis & { [LOCKS]?: Map<string, Promise<void>> };
const locks = (store[LOCKS] ??= new Map());

/**
 * Runs `fn` after every earlier call for the same request has finished. The
 * app runs as one Node process, so this serializes reading current.pdf,
 * adding the signature and writing it back.
 */
export async function withRequestLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(id) ?? Promise.resolve();
  const run = prev.then(fn);
  const tail = run.then(
    () => {},
    () => {},
  );
  locks.set(id, tail);
  try {
    return await run;
  } finally {
    if (locks.get(id) === tail) locks.delete(id);
  }
}

/** The images the signing page uploads (signature, initials, company stamp). */
export const SIGNER_IMAGES = new Set(["signature", "initials", "stamp"]);
export const MAX_SIGNER_OVERLAYS = 200;
const MAX_IMAGE_W = 300;
const MAX_IMAGE_H = 200;
const MAX_TEXT_SIZE = 24;
const MAX_TEXT_LENGTH = 200;

const finite = (v: unknown, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

/**
 * Keeps what the signing page places: signature/initials/stamp images and
 * single-line text (name, date, text), capped in size. Shapes, lines and
 * free drawing (which could white out or rewrite the document) are refused.
 * Returns null when anything else is sent.
 */
export function signerOverlays(raw: unknown): Overlay[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_SIGNER_OVERLAYS) return null;
  const out: Overlay[] = [];
  for (const ov of raw as Record<string, unknown>[]) {
    if (!ov || typeof ov !== "object") return null;
    const page = Math.round(finite(ov.page, 1));
    if (ov.kind === "image") {
      if (!SIGNER_IMAGES.has(String(ov.image))) return null;
      const w = Math.max(0, finite(ov.w));
      const h = Math.max(0, finite(ov.h));
      const scale = Math.min(1, w ? MAX_IMAGE_W / w : 1, h ? MAX_IMAGE_H / h : 1);
      out.push({ kind: "image", page, x: finite(ov.x), y: finite(ov.y), w: w * scale, h: h * scale, image: String(ov.image) });
    } else if (ov.kind === "text") {
      const text = String(ov.text ?? "").replace(/[\r\n]+/g, " ").slice(0, MAX_TEXT_LENGTH);
      out.push({
        kind: "text",
        page,
        x: finite(ov.x),
        y: finite(ov.y),
        text,
        size: Math.min(MAX_TEXT_SIZE, Math.max(1, finite(ov.size, 14))),
        color: String(ov.color ?? "#000000"),
        font: String(ov.font ?? "Helvetica"),
        bold: Boolean(ov.bold),
      });
    } else return null;
  }
  return out;
}

/**
 * Draws the overlays on a separate layer and stamps it onto each page with
 * the Multiply blend mode: marks can only darken the page, so white boxes,
 * white-backed images or white text cannot hide the content underneath.
 */
export async function stampSignerOverlays(ctx: Parameters<typeof applyOverlays>[0], doc: PDFDocument, overlays: Overlay[]) {
  const count = doc.getPageCount();
  const layer = await PDFDocument.create();
  for (let i = 0; i < count; i++) layer.addPage([10, 10]);
  await applyOverlays(ctx, layer, overlays);

  // Same page clamp as applyOverlays, so each mark lands on the page it was drawn on.
  const used = [...new Set(overlays.map((o) => Math.min(count, Math.max(1, Math.round(finite(o.page, 1))))))];
  const box = { left: -20000, bottom: -20000, right: 20000, top: 20000 };
  const embedded = await doc.embedPages(
    used.map((n) => layer.getPage(n - 1)),
    used.map(() => box),
    used.map(() => [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number]),
  );
  used.forEach((n, i) => doc.getPage(n - 1).drawPage(embedded[i], { x: 0, y: 0, blendMode: BlendMode.Multiply }));
}
