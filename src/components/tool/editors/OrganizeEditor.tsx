"use client";

import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import { openPdf } from "@/lib/pdf-client";
import { Icon } from "../../Icon";
import { Workspace } from "../GenericWorkspace";
import { LazyVisible, PdfPage } from "../PdfPage";
import { useFilePicker } from "../SelectFiles";
import type { EditorProps } from "../ToolRunner";

type PageItem = { id: string; fileId: string; page: number; rotate: number } | { id: string; blank: true };

let n = 0;
const uid = () => `p${++n}`;

function PageThumb({
  item,
  index,
  doc,
  color,
  onRotate,
  onDelete,
  onInsertBlank,
}: {
  item: PageItem;
  index: number;
  doc?: PDFDocumentProxy;
  color: string;
  onRotate: () => void;
  onDelete: () => void;
  onInsertBlank: () => void;
}) {
  const t = useT();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group relative flex w-40 flex-col items-center rounded-xl border bg-white p-2 ${isDragging ? "z-10 border-brand shadow-xl" : "border-line"}`}
    >
      <div {...attributes} {...listeners} className="flex h-48 w-full cursor-grab items-center justify-center overflow-hidden active:cursor-grabbing">
        {"blank" in item ? (
          <div className="flex h-44 w-32 items-center justify-center border border-dashed border-line bg-white text-xs text-muted">{t("Blank page")}</div>
        ) : doc ? (
          <LazyVisible height={170} className="flex w-full items-center justify-center">
            <PdfPage doc={doc} pageNumber={item.page} width={120} rotation={item.rotate} />
          </LazyVisible>
        ) : (
          <span className="text-xs text-muted">{t("Loading…")}</span>
        )}
      </div>
      <div className="mt-1 flex w-full items-center justify-between px-1 text-xs">
        <span className="font-semibold">{index + 1}</span>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} title={t("Source file")} />
      </div>
      <div className="absolute end-1 top-1 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
        {!("blank" in item) && (
          <button onClick={onRotate} className="rounded-full bg-white p-1.5 shadow hover:text-brand" title={t("Rotate")}>
            <Icon name="rotate-clockwise" size={15} />
          </button>
        )}
        <button onClick={onDelete} className="rounded-full bg-white p-1.5 shadow hover:text-brand" title={t("Delete page")}>
          <Icon name="trash" size={15} />
        </button>
      </div>
      <button
        onClick={onInsertBlank}
        className="absolute -end-4 top-1/2 z-10 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-brand text-white shadow group-hover:flex"
        title={t("Insert blank page after")}
      >
        <Icon name="plus" size={16} />
      </button>
    </div>
  );
}

const FILE_COLORS = ["#e5322d", "#2d7ff9", "#6aa84f", "#f1b800", "#8e44ad", "#ff7a1a"];

export default function OrganizeEditor({ tool, items, addFiles, submit, error, setError }: EditorProps) {
  const t = useT();
  const [docs, setDocs] = useState<Record<string, PDFDocumentProxy>>({});
  const [pages, setPages] = useState<PageItem[]>([]);
  const picker = useFilePicker(tool, addFiles);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Open each newly added file once and append its pages. The ref (not state)
  // guards against the effect running twice before the first open finishes.
  const opened = useRef(new Set<string>());
  // Free every pdf.js document (and its worker memory) when leaving the editor.
  const allDocs = useRef<PDFDocumentProxy[]>([]);
  useEffect(() => () => allDocs.current.forEach((d) => void d.loadingTask.destroy()), []);
  useEffect(() => {
    for (const it of items) {
      if (opened.current.has(it.id)) continue;
      opened.current.add(it.id);
      openPdf(it.file)
        .then((d) => {
          allDocs.current.push(d);
          setDocs((cur) => ({ ...cur, [it.id]: d }));
          setPages((cur) => [
            ...cur,
            ...Array.from({ length: d.numPages }, (_, i) => ({ id: uid(), fileId: it.id, page: i + 1, rotate: 0 })),
          ]);
        })
        .catch(() => setError(t('"{file}" could not be opened. Is it password protected?', { file: it.file.name })));
    }
  }, [items, setError, t]);

  const colorOf = useMemo(
    () => Object.fromEntries(items.map((it, i) => [it.id, FILE_COLORS[i % FILE_COLORS.length]])),
    [items],
  );

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    setPages((cur) => arrayMove(cur, cur.findIndex((p) => p.id === e.active.id), cur.findIndex((p) => p.id === e.over!.id)));
  };

  function go() {
    if (!pages.length) return setError(t("Your document has no pages left. Add at least one page."));
    const fileIndex = Object.fromEntries(items.map((it, i) => [it.id, i]));
    submit(
      items.map((i) => i.file),
      {
        pages: pages.map((p) =>
          "blank" in p ? { blank: true } : { file: fileIndex[p.fileId], page: p.page, rotate: p.rotate },
        ),
      },
    );
  }

  const reset = () =>
    setPages(
      items.flatMap((it) =>
        Array.from({ length: docs[it.id]?.numPages ?? 0 }, (_, i) => ({ id: uid(), fileId: it.id, page: i + 1, rotate: 0 })),
      ),
    );

  return (
    <Workspace
      title={tool.name}
      error={error}
      action={tool.action}
      onAction={go}
      main={
        <>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={pages.map((p) => p.id)} strategy={rectSortingStrategy}>
              <div className="flex flex-wrap justify-center gap-5">
                {pages.map((p, i) => (
                  <PageThumb
                    key={p.id}
                    item={p}
                    index={i}
                    doc={"blank" in p ? undefined : docs[p.fileId]}
                    color={"blank" in p ? "#ccc" : colorOf[p.fileId]}
                    onRotate={() => setPages((cur) => cur.map((x) => (x.id === p.id && !("blank" in x) ? { ...x, rotate: (x.rotate + 90) % 360 } : x)))}
                    onDelete={() => setPages((cur) => cur.filter((x) => x.id !== p.id))}
                    onInsertBlank={() => setPages((cur) => [...cur.slice(0, i + 1), { id: uid(), blank: true }, ...cur.slice(i + 1)])}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          {picker.element}
        </>
      }
      sidebar={
        <div className="space-y-4">
          <p className="rounded-lg bg-bg p-4 text-sm text-muted">
            {t("Drag pages to reorder them. Hover a page to rotate or delete it, or use the + to insert a blank page.")}
          </p>
          <div className="space-y-1.5">
            {items.map((it) => (
              <div key={it.id} className="flex items-center gap-2 text-sm">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: colorOf[it.id] }} />
                <span className="truncate">{it.file.name}</span>
              </div>
            ))}
          </div>
          <button className="btn-secondary w-full" onClick={picker.open}>
            <Icon name="file-plus" size={18} /> {t("Add PDF file")}
          </button>
          <button className="btn-secondary w-full" onClick={() => setPages((cur) => [...cur, { id: uid(), blank: true }])}>
            <Icon name="plus" size={18} /> {t("Add blank page")}
          </button>
          <button className="w-full text-sm font-medium text-brand underline" onClick={reset}>{t("Reset all")}</button>
          <p className="text-center text-sm text-muted">{t("{n} pages", { n: pages.length })}</p>
        </div>
      }
    />
  );
}
