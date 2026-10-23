"use client";

import { useRef, useState, type ReactNode } from "react";
import { useT } from "@/i18n/client";

export type Box = { left: number; top: number; width: number; height: number };

/**
 * Transparent layer over a page that lets the user drag out rectangles.
 * Coordinates are CSS pixels relative to the page box.
 */
export function DrawLayer({
  onBox,
  minSize = 6,
  cursor = "crosshair",
  previewClass = "border-2 border-dashed border-brand bg-brand/10",
  children,
}: {
  onBox: (b: Box) => void;
  minSize?: number;
  cursor?: string;
  previewClass?: string;
  children?: ReactNode;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<Box | null>(null);

  const point = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(Math.max(e.clientX - r.left, 0), r.width),
      y: Math.min(Math.max(e.clientY - r.top, 0), r.height),
    };
  };
  const boxFrom = (a: { x: number; y: number }, b: { x: number; y: number }): Box => ({
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  });

  return (
    <div
      className="absolute inset-0 touch-none select-none"
      style={{ cursor }}
      onPointerDown={(e) => {
        if (e.target !== e.currentTarget) return; // let child handles receive their own events
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = point(e);
        setDraft({ left: start.current.x, top: start.current.y, width: 0, height: 0 });
      }}
      onPointerMove={(e) => {
        if (start.current) setDraft(boxFrom(start.current, point(e)));
      }}
      onPointerUp={(e) => {
        if (!start.current) return;
        const box = boxFrom(start.current, point(e));
        start.current = null;
        setDraft(null);
        if (box.width >= minSize && box.height >= minSize) onBox(box);
      }}
    >
      {children}
      {draft && <div className={`pointer-events-none absolute ${previewClass}`} style={draft} />}
    </div>
  );
}

/** Small page switcher used by single-document editors. */
export function PageNav({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  const t = useT();
  if (total <= 1) return null;
  return (
    <div className="mb-4 flex items-center justify-center gap-3 text-sm">
      <button className="btn-secondary !px-3 !py-1.5" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ‹ {t("Prev")}
      </button>
      <span className="font-medium">
        {t("Page {page} of {total}", { page, total })}
      </span>
      <button className="btn-secondary !px-3 !py-1.5" disabled={page >= total} onClick={() => onPage(page + 1)}>
        {t("Next")} ›
      </button>
    </div>
  );
}
