"use client";

import type { PDFDocumentProxy, PDFPageProxy, PageViewport } from "pdfjs-dist";

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

/** Loads pdf.js only in the browser, with its worker served from /public. */
export function pdfjs() {
  pdfjsPromise ??= import("pdfjs-dist").then((m) => {
    m.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    return m;
  });
  return pdfjsPromise;
}

export class PdfPasswordError extends Error {}

export async function openPdf(file: File | Blob, password?: string): Promise<PDFDocumentProxy> {
  const lib = await pdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  try {
    return await lib.getDocument({ data, password }).promise;
  } catch (e) {
    if ((e as { name?: string }).name === "PasswordException") throw new PdfPasswordError();
    throw e;
  }
}

/**
 * Starts rendering a page into the canvas, scaled to `targetWidth` CSS pixels.
 * Call `cancel()` before starting another render on the same canvas.
 */
export function startRender(page: PDFPageProxy, canvas: HTMLCanvasElement, targetWidth: number, rotation = 0) {
  const rot = (((page.rotate + rotation) % 360) + 360) % 360;
  const base = page.getViewport({ scale: 1, rotation: rot });
  const viewport = page.getViewport({ scale: targetWidth / base.width, rotation: rot });
  // Draw off-screen first so a cancelled render never blanks the visible canvas.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const off = document.createElement("canvas");
  off.width = Math.floor(viewport.width * dpr);
  off.height = Math.floor(viewport.height * dpr);
  const offCtx = off.getContext("2d")!;
  offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const task = page.render({ canvas: off, canvasContext: offCtx, viewport });
  const done = task.promise.then(() => {
    canvas.width = off.width;
    canvas.height = off.height;
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    canvas.getContext("2d")!.drawImage(off, 0, 0);
    return viewport;
  });
  return { viewport, done, cancel: () => task.cancel() };
}

export async function renderPage(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  targetWidth: number,
  rotation = 0,
): Promise<PageViewport> {
  return startRender(page, canvas, targetWidth, rotation).done;
}

/** First-page thumbnail as a data URL, plus the page count. */
export async function pdfThumbnail(file: File, width = 160): Promise<{ url: string; pages: number } | { locked: true }> {
  try {
    const doc = await openPdf(file);
    const page = await doc.getPage(1);
    const canvas = document.createElement("canvas");
    await renderPage(page, canvas, width);
    const result = { url: canvas.toDataURL("image/jpeg", 0.8), pages: doc.numPages };
    void doc.loadingTask.destroy();
    return result;
  } catch (e) {
    if (e instanceof PdfPasswordError) return { locked: true };
    throw e;
  }
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/** Re-encodes any browser-readable image as JPEG, applying EXIF orientation. */
export async function imageToJpeg(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; // transparent PNG areas become white, not black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/jpeg", 0.92),
  );
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
}
