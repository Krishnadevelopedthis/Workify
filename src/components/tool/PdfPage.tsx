"use client";

import type { PDFDocumentProxy, PageViewport } from "pdfjs-dist";
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { openPdf, PdfPasswordError, startRender } from "@/lib/pdf-client";

export function usePdf(file: File | null) {
  // Results are keyed by the file they came from, so a new file never shows the old document.
  const [state, setState] = useState<{ file: File; doc?: PDFDocumentProxy; error?: string } | null>(null);
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    let opened: PDFDocumentProxy | null = null;
    openPdf(file)
      .then((doc) => {
        opened = doc;
        if (!cancelled) setState({ file, doc });
      })
      .catch((e) => {
        if (cancelled) return;
        setState({
          file,
          error: e instanceof PdfPasswordError ? "This PDF is password protected. Unlock it first." : "This PDF could not be opened.",
        });
      });
    return () => {
      cancelled = true;
      void opened?.loadingTask.destroy();
    };
  }, [file]);
  const current = state?.file === file ? state : null;
  return { doc: current?.doc ?? null, error: current?.error ?? null, numPages: current?.doc?.numPages ?? 0 };
}

/**
 * Renders one page and overlays `children` in a box of the same CSS size.
 * `onViewport` receives the viewport used, for screen <-> PDF conversions.
 */
export function PdfPage({
  doc,
  pageNumber,
  width,
  rotation = 0,
  onViewport,
  children,
  className = "",
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  width: number;
  rotation?: number;
  onViewport?: (v: PageViewport) => void;
  children?: ReactNode;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  // Always calls the latest callback without re-rendering the page when it changes.
  const reportViewport = useEffectEvent((vp: PageViewport) => onViewport?.(vp));

  useEffect(() => {
    let cancelled = false;
    let cancelRender: (() => void) | null = null;
    doc
      .getPage(pageNumber)
      .then(async (page) => {
        if (cancelled || !canvas.current) return;
        const r = startRender(page, canvas.current, width, rotation);
        cancelRender = r.cancel;
        const vp = await r.done;
        if (cancelled) return;
        setSize({ w: vp.width, h: vp.height });
        reportViewport(vp);
      })
      .catch(() => {
        // cancelled because a newer render replaced this one
      });
    return () => {
      cancelled = true;
      cancelRender?.();
    };
  }, [doc, pageNumber, width, rotation]);

  return (
    <div className={`relative inline-block bg-white shadow-md ${className}`} style={size ? { width: size.w, height: size.h } : { width, minHeight: width * 1.3 }}>
      <canvas ref={canvas} className="block" />
      {size && <div className="absolute inset-0">{children}</div>}
    </div>
  );
}

/** Screen (CSS px within the page box) -> PDF user-space points. */
export function toPdf(vp: PageViewport, x: number, y: number): [number, number] {
  const [px, py] = vp.convertToPdfPoint(x, y) as [number, number];
  return [px, py];
}

/** A screen rectangle -> PDF user-space {x, y, width, height} with bottom-left origin. */
export function rectToPdf(vp: PageViewport, x: number, y: number, w: number, h: number) {
  const [x0, y0] = toPdf(vp, x, y);
  const [x1, y1] = toPdf(vp, x + w, y + h);
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) };
}

/** PDF user-space rect -> screen box, the inverse of rectToPdf. */
export function rectToScreen(vp: PageViewport, r: { x: number; y: number; width: number; height: number }) {
  const [a, b] = vp.convertToViewportPoint(r.x, r.y) as [number, number];
  const [c, d] = vp.convertToViewportPoint(r.x + r.width, r.y + r.height) as [number, number];
  return { left: Math.min(a, c), top: Math.min(b, d), width: Math.abs(c - a), height: Math.abs(d - b) };
}

/**
 * Renders `children` only once the box has come near the viewport, so long
 * documents don't render hundreds of page canvases up front.
 */
export function LazyVisible({ children, height, className = "" }: { children: ReactNode; height: number; className?: string }) {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!node || seen) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [node, seen]);
  return (
    <div ref={setNode} className={className} style={seen ? undefined : { minHeight: height }}>
      {seen ? children : <div className="h-full w-full animate-pulse rounded bg-line/60" style={{ height }} />}
    </div>
  );
}

/** Responsive page width: fits the container but never larger than `max`. */
export function useFitWidth(max = 820) {
  // A callback ref (state setter) so render code never reads a ref object.
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    if (!node) return;
    // Debounced: every width change re-renders the PDF page, which is expensive.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ro = new ResizeObserver(([e]) => {
      clearTimeout(timer);
      const w = Math.max(260, Math.min(max, Math.floor(e.contentRect.width - 16)));
      timer = setTimeout(() => setWidth(w), 150);
    });
    ro.observe(node);
    return () => {
      clearTimeout(timer);
      ro.disconnect();
    };
  }, [node, max]);
  return { measure: setNode, width };
}
