"use client";

import type { PageViewport } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import { Icon } from "../../Icon";
import { PageNav } from "../DrawLayer";
import { Workspace } from "../GenericWorkspace";
import { elId, ElementsLayer, toOverlay, type El } from "../overlay";
import { PdfPage, toPdf, useFitWidth, usePdf } from "../PdfPage";
import type { EditorProps } from "../ToolRunner";

type ToolMode = "select" | "text" | "image" | "rect" | "ellipse" | "line" | "path";

const TOOLBAR: { id: ToolMode; icon: string; label: string }[] = [
  { id: "select", icon: "arrow-back-up", label: "Select & move" },
  { id: "text", icon: "typography", label: "Add text" },
  { id: "image", icon: "photo", label: "Add image" },
  { id: "rect", icon: "square", label: "Rectangle" },
  { id: "ellipse", icon: "circle", label: "Ellipse" },
  { id: "line", icon: "line", label: "Line" },
  { id: "path", icon: "pencil", label: "Draw" },
];

export default function EditEditor({ tool, items, submit, error, setError }: EditorProps) {
  const { doc, error: loadError, numPages } = usePdf(items[0]?.file ?? null);
  const [page, setPage] = useState(1);
  const [vp, setVp] = useState<PageViewport | null>(null);
  const [mode, setMode] = useState<ToolMode>("text");
  const [elements, setElements] = useState<El[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [images, setImages] = useState<Record<string, File>>({});
  const [style, setStyle] = useState({ color: "#e5322d", fill: "", strokeWidth: 2, size: 16, font: "Helvetica", bold: false });
  const draft = useRef<{ start: [number, number]; id: string } | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const pendingImagePoint = useRef<[number, number] | null>(null);
  const { measure: fitMeasure, width: fitWidth } = useFitWidth(820);

  const sel = elements.find((e) => e.id === selected) ?? null;
  const update = (el: El) => setElements((all) => all.map((x) => (x.id === el.id ? el : x)));
  const remove = (id: string) => {
    setElements((all) => all.filter((x) => x.id !== id));
    setSelected(null);
  };

  // Delete / Backspace removes the selected element (but not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest("input, textarea, select");
      if (selected && !typing && (e.key === "Delete" || e.key === "Backspace")) remove(selected);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  // Applying a style change also restyles the selected element.
  function setStyleAndSelected(patch: Partial<typeof style>) {
    setStyle((s) => ({ ...s, ...patch }));
    if (!sel) return;
    if (sel.kind === "text") update({ ...sel, ...(patch.color && { color: patch.color }), ...(patch.size && { size: patch.size }), ...(patch.font && { font: patch.font }), ...(patch.bold !== undefined && { bold: patch.bold }) });
    if (sel.kind === "rect" || sel.kind === "ellipse") update({ ...sel, ...(patch.color && { stroke: patch.color }), ...(patch.strokeWidth && { strokeWidth: patch.strokeWidth }), ...(patch.fill !== undefined && { fill: patch.fill || null }) });
    if (sel.kind === "line" || sel.kind === "path") update({ ...sel, ...(patch.color && { stroke: patch.color }), ...(patch.strokeWidth && { strokeWidth: patch.strokeWidth }) });
  }

  const local = (e: React.PointerEvent<HTMLDivElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return toPdf(vp!, e.clientX - r.left, e.clientY - r.top);
  };

  function onDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!vp) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = local(e);
    const id = elId();
    if (mode === "text") {
      const el: El = { id, page, kind: "text", x, y, text: "Type your text", size: style.size, color: style.color, font: style.font, bold: style.bold };
      setElements((a) => [...a, el]);
      setSelected(id);
      setMode("select");
      return;
    }
    if (mode === "image") {
      pendingImagePoint.current = [x, y];
      imageInput.current?.click();
      return;
    }
    draft.current = { start: [x, y], id };
    const stroke = style.color;
    const strokeWidth = style.strokeWidth;
    if (mode === "rect" || mode === "ellipse") setElements((a) => [...a, { id, page, kind: mode, x, y, w: 0, h: 0, stroke, fill: style.fill || null, strokeWidth }]);
    if (mode === "line") setElements((a) => [...a, { id, page, kind: "line", x1: x, y1: y, x2: x, y2: y, stroke, strokeWidth }]);
    if (mode === "path") setElements((a) => [...a, { id, page, kind: "path", points: [[x, y]], stroke, strokeWidth }]);
  }

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = draft.current;
    if (!d || !vp) return;
    const [x, y] = local(e);
    setElements((all) =>
      all.map((el) => {
        if (el.id !== d.id) return el;
        if (el.kind === "rect" || el.kind === "ellipse") {
          return { ...el, x: Math.min(d.start[0], x), y: Math.min(d.start[1], y), w: Math.abs(x - d.start[0]), h: Math.abs(y - d.start[1]) };
        }
        if (el.kind === "line") return { ...el, x2: x, y2: y };
        if (el.kind === "path") return { ...el, points: [...el.points, [x, y]] };
        return el;
      }),
    );
  }

  function onUp() {
    const d = draft.current;
    draft.current = null;
    if (!d) return;
    // Drop accidental clicks that made a zero-size shape.
    setElements((all) =>
      all.filter((el) => {
        if (el.id !== d.id) return true;
        if (el.kind === "rect" || el.kind === "ellipse") return el.w > 2 && el.h > 2;
        if (el.kind === "line") return Math.hypot(el.x2 - el.x1, el.y2 - el.y1) > 2;
        if (el.kind === "path") return el.points.length > 1;
        return true;
      }),
    );
  }

  function onImagePicked(file: File | undefined) {
    const at = pendingImagePoint.current;
    pendingImagePoint.current = null;
    if (!file || !at) return;
    if (!/image\/(png|jpe?g)/.test(file.type)) return setError("Use a PNG or JPG image.");
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const w = Math.min(200, img.width);
      const h = (w / img.width) * img.height;
      const key = `img_${elId()}`;
      setImages((m) => ({ ...m, [key]: file }));
      const id = elId();
      setElements((a) => [...a, { id, page, kind: "image", x: at[0], y: at[1] - h, w, h, image: key, url }]);
      setSelected(id);
      setMode("select");
    };
    img.src = url;
  }

  function go() {
    if (!elements.length) return setError("Add some text, an image, a shape or a drawing before saving.");
    const used = new Set(elements.flatMap((e) => (e.kind === "image" ? [e.image] : [])));
    const extras = Object.fromEntries(Object.entries(images).filter(([k]) => used.has(k)));
    submit([items[0].file], { overlays: elements.map(toOverlay) }, extras);
  }

  const pageEls = elements.filter((e) => e.page === page);

  return (
    <Workspace
      title={tool.name}
      error={error ?? loadError ?? undefined}
      action={tool.action}
      onAction={go}
      main={
        <div ref={fitMeasure} className="flex flex-col items-center">
          <div className="sticky top-2 z-20 mb-4 flex flex-wrap justify-center gap-1 rounded-xl border border-line bg-white p-1.5 shadow">
            {TOOLBAR.map((t) => (
              <button
                key={t.id}
                title={t.label}
                onClick={() => setMode(t.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ${mode === t.id ? "bg-brand text-white" : "hover:bg-bg"}`}
              >
                <Icon name={t.icon} size={18} />
                <span className="hidden md:inline">{t.label}</span>
              </button>
            ))}
          </div>
          <PageNav page={page} total={numPages} onPage={(p) => { setPage(p); setSelected(null); }} />
          {doc && (
            <PdfPage doc={doc} pageNumber={page} width={fitWidth} onViewport={setVp}>
              {vp && (
                <>
                  {mode !== "select" && (
                    <div className="absolute inset-0 touch-none" style={{ cursor: mode === "text" ? "text" : "crosshair" }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} />
                  )}
                  <ElementsLayer vp={vp} elements={pageEls} selectedId={selected} interactive={mode === "select"} onSelect={setSelected} onChange={update} />
                </>
              )}
            </PdfPage>
          )}
          <input ref={imageInput} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { onImagePicked(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
      }
      sidebar={
        <div className="space-y-5">
          {sel?.kind === "text" && (
            <div>
              <p className="mb-2 text-sm font-semibold">Text</p>
              <textarea
                className="input min-h-24"
                value={sel.text}
                onChange={(e) => update({ ...sel, text: e.target.value })}
                onFocus={(e) => sel.text === "Type your text" && e.target.select()}
                autoFocus
              />
            </div>
          )}
          <div>
            <p className="mb-2 text-sm font-semibold">Color</p>
            <div className="flex flex-wrap items-center gap-2">
              {["#000000", "#e5322d", "#2d7ff9", "#6aa84f", "#f1b800", "#8e44ad", "#ffffff"].map((c) => (
                <button key={c} onClick={() => setStyleAndSelected({ color: c })} aria-label={c} className={`h-7 w-7 rounded-full border ${style.color === c ? "ring-2 ring-brand ring-offset-2" : "border-line"}`} style={{ background: c }} />
              ))}
              <input type="color" value={style.color} onChange={(e) => setStyleAndSelected({ color: e.target.value })} className="h-7 w-9 cursor-pointer rounded border border-line" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="mb-1 block font-semibold">Font size</span>
              <input type="number" min={6} max={144} className="input" value={style.size} onChange={(e) => setStyleAndSelected({ size: Number(e.target.value) || 16 })} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold">Line width</span>
              <input type="number" min={1} max={20} className="input" value={style.strokeWidth} onChange={(e) => setStyleAndSelected({ strokeWidth: Number(e.target.value) || 1 })} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="mb-1 block font-semibold">Font</span>
              <select className="input" value={style.font} onChange={(e) => setStyleAndSelected({ font: e.target.value })}>
                <option value="Helvetica">Helvetica</option>
                <option value="TimesRoman">Times</option>
                <option value="Courier">Courier</option>
              </select>
            </label>
            <label className="flex items-end gap-2 pb-2 text-sm font-semibold">
              <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={style.bold} onChange={(e) => setStyleAndSelected({ bold: e.target.checked })} />
              Bold
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">Shape fill</span>
            <select className="input" value={style.fill} onChange={(e) => setStyleAndSelected({ fill: e.target.value })}>
              <option value="">No fill</option>
              <option value="#ffffff">White (cover content)</option>
              <option value="#000000">Black</option>
              <option value="#fff59d">Highlight yellow</option>
              <option value={style.color}>Same as color</option>
            </select>
          </label>
          {sel && (
            <button className="btn-secondary w-full !text-brand" onClick={() => remove(sel.id)}>
              <Icon name="trash" size={18} /> Delete selected
            </button>
          )}
          <p className="text-xs text-muted">{elements.length} edits on {new Set(elements.map((e) => e.page)).size} page(s). Tip: press Delete to remove the selected item.</p>
        </div>
      }
    />
  );
}
