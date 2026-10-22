"use client";

import type { PageViewport } from "pdfjs-dist";
import { useRef } from "react";
import { toPdf } from "./PdfPage";

// Elements are stored in PDF user-space points (bottom-left origin),
// so they stay put across zoom levels and are sent to the server as-is.
type Base = { id: string; page: number };
export type TextEl = Base & { kind: "text"; x: number; y: number; text: string; size: number; color: string; font: string; bold: boolean };
export type BoxEl = Base & { kind: "rect" | "ellipse"; x: number; y: number; w: number; h: number; stroke: string; fill: string | null; strokeWidth: number };
export type LineEl = Base & { kind: "line"; x1: number; y1: number; x2: number; y2: number; stroke: string; strokeWidth: number };
export type PathEl = Base & { kind: "path"; points: [number, number][]; stroke: string; strokeWidth: number };
export type ImageEl = Base & { kind: "image"; x: number; y: number; w: number; h: number; image: string; url: string };
export type El = TextEl | BoxEl | LineEl | PathEl | ImageEl;

let seq = 0;
export const elId = () => `el${++seq}`;

const CSS_FONT: Record<string, string> = {
  Helvetica: "Helvetica, Arial, sans-serif",
  TimesRoman: "'Times New Roman', Times, serif",
  Courier: "'Courier New', Courier, monospace",
};

const view = (vp: PageViewport, x: number, y: number) => vp.convertToViewportPoint(x, y) as [number, number];

/** Moves an element by a PDF-space delta. */
export function moveEl(el: El, dx: number, dy: number): El {
  switch (el.kind) {
    case "text":
    case "rect":
    case "ellipse":
    case "image":
      return { ...el, x: el.x + dx, y: el.y + dy };
    case "line":
      return { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy };
    case "path":
      return { ...el, points: el.points.map(([x, y]) => [x + dx, y + dy] as [number, number]) };
  }
}

/** Strips browser-only fields before sending overlays to the server. */
export function toOverlay(el: El) {
  const out: Record<string, unknown> = { ...el };
  delete out.id;
  delete out.url;
  return out;
}

/**
 * Renders a page's elements. When `interactive`, elements can be selected,
 * dragged, and images/boxes resized from their bottom-right corner.
 */
export function ElementsLayer({
  vp,
  elements,
  selectedId,
  interactive,
  onSelect,
  onChange,
}: {
  vp: PageViewport;
  elements: El[];
  selectedId: string | null;
  interactive: boolean;
  onSelect: (id: string | null) => void;
  onChange: (el: El) => void;
}) {
  const drag = useRef<{ id: string; start: [number, number]; orig: El; mode: "move" | "resize" } | null>(null);

  const startDrag = (e: React.PointerEvent, el: El, mode: "move" | "resize") => {
    if (!interactive) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    onSelect(el.id);
    const box = (e.currentTarget as HTMLElement).closest("[data-layer]")!.getBoundingClientRect();
    drag.current = { id: el.id, start: toPdf(vp, e.clientX - box.left, e.clientY - box.top), orig: el, mode };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const [px, py] = toPdf(vp, e.clientX - box.left, e.clientY - box.top);
    const dx = px - d.start[0];
    const dy = py - d.start[1];
    if (d.mode === "move") return onChange(moveEl(d.orig, dx, dy));
    const o = d.orig;
    if (o.kind === "image") {
      // Keep the image's aspect ratio; the top-left corner stays fixed.
      const w = Math.max(10, o.w + dx);
      const h = (w / o.w) * o.h;
      onChange({ ...o, w, h, y: o.y + o.h - h });
    } else if (o.kind === "rect" || o.kind === "ellipse") {
      const w = Math.max(4, o.w + dx);
      const h = Math.max(4, o.h - dy);
      onChange({ ...o, w, h, y: o.y + o.h - h });
    }
  };

  return (
    <div
      data-layer
      className="absolute inset-0"
      style={{ pointerEvents: interactive ? "auto" : "none" }}
      onPointerDown={(e) => interactive && e.target === e.currentTarget && onSelect(null)}
      onPointerMove={onMove}
      onPointerUp={() => (drag.current = null)}
    >
      <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        {elements.map((el) => {
          const sel = el.id === selectedId;
          const common = {
            onPointerDown: (e: React.PointerEvent) => startDrag(e, el, "move"),
            style: { pointerEvents: interactive ? ("all" as const) : ("none" as const), cursor: interactive ? "move" : undefined },
          };
          if (el.kind === "rect" || el.kind === "ellipse") {
            const [ax, ay] = view(vp, el.x, el.y + el.h);
            const [bx, by] = view(vp, el.x + el.w, el.y);
            const w = Math.abs(bx - ax), h = Math.abs(by - ay), left = Math.min(ax, bx), top = Math.min(ay, by);
            const sw = el.strokeWidth * vp.scale;
            return el.kind === "rect" ? (
              <rect key={el.id} x={left} y={top} width={w} height={h} stroke={el.stroke} strokeWidth={sw} fill={el.fill ?? "transparent"} strokeDasharray={sel ? "6 3" : undefined} {...common} />
            ) : (
              <ellipse key={el.id} cx={left + w / 2} cy={top + h / 2} rx={w / 2} ry={h / 2} stroke={el.stroke} strokeWidth={sw} fill={el.fill ?? "transparent"} strokeDasharray={sel ? "6 3" : undefined} {...common} />
            );
          }
          if (el.kind === "line") {
            const [x1, y1] = view(vp, el.x1, el.y1);
            const [x2, y2] = view(vp, el.x2, el.y2);
            return (
              <g key={el.id} {...common}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={14} />
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={el.stroke} strokeWidth={el.strokeWidth * vp.scale} strokeLinecap="round" strokeDasharray={sel ? "6 3" : undefined} />
              </g>
            );
          }
          if (el.kind === "path") {
            const d = el.points.map(([x, y], i) => `${i ? "L" : "M"}${view(vp, x, y).join(" ")}`).join(" ");
            return (
              <g key={el.id} {...common}>
                <path d={d} stroke="transparent" strokeWidth={14} fill="none" />
                <path d={d} stroke={el.stroke} strokeWidth={el.strokeWidth * vp.scale} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={sel ? 0.6 : 1} />
              </g>
            );
          }
          return null;
        })}
      </svg>

      {elements.map((el) => {
        const sel = el.id === selectedId;
        if (el.kind === "text") {
          const [sx, sy] = view(vp, el.x, el.y);
          const px = el.size * vp.scale;
          return (
            <div
              key={el.id}
              onPointerDown={(e) => startDrag(e, el, "move")}
              className={`absolute whitespace-pre ${sel ? "outline-2 outline-offset-2 outline-dashed outline-brand" : ""}`}
              style={{
                left: sx,
                top: sy - px * 0.8,
                fontSize: px,
                lineHeight: 1.2,
                color: el.color,
                fontFamily: CSS_FONT[el.font] ?? CSS_FONT.Helvetica,
                fontWeight: el.bold ? 700 : 400,
                cursor: interactive ? "move" : undefined,
                pointerEvents: interactive ? "auto" : "none",
              }}
            >
              {el.text || " "}
            </div>
          );
        }
        if (el.kind === "image") {
          const [ax, ay] = view(vp, el.x, el.y + el.h);
          const [bx, by] = view(vp, el.x + el.w, el.y);
          return (
            <div
              key={el.id}
              onPointerDown={(e) => startDrag(e, el, "move")}
              className={`absolute ${sel ? "outline-2 outline-dashed outline-brand" : ""}`}
              style={{ left: Math.min(ax, bx), top: Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay), cursor: interactive ? "move" : undefined, pointerEvents: interactive ? "auto" : "none" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={el.url} alt="" draggable={false} className="h-full w-full select-none" />
              {sel && interactive && <ResizeHandle onPointerDown={(e) => startDrag(e, el, "resize")} />}
            </div>
          );
        }
        if ((el.kind === "rect" || el.kind === "ellipse") && sel && interactive) {
          const [bx, by] = view(vp, el.x + el.w, el.y);
          return (
            <div key={`${el.id}-h`} className="absolute" style={{ left: bx - 6, top: by - 6, width: 12, height: 12 }}>
              <ResizeHandle onPointerDown={(e) => startDrag(e, el, "resize")} />
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

function ResizeHandle({ onPointerDown }: { onPointerDown: (e: React.PointerEvent) => void }) {
  return (
    <span
      onPointerDown={onPointerDown}
      className="absolute -right-1.5 -bottom-1.5 h-3 w-3 cursor-nwse-resize rounded-sm border-2 border-white bg-brand shadow"
    />
  );
}
