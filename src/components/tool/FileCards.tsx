"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useState } from "react";
import { useT } from "@/i18n/client";
import { formatBytes, pdfThumbnail } from "@/lib/pdf-client";
import { Icon } from "../Icon";
import { LazyVisible } from "./PdfPage";

export type FileItem = { id: string; file: File; rotation: number };

let counter = 0;
export const toItems = (files: File[]): FileItem[] =>
  files.map((file) => ({ id: `f${++counter}`, file, rotation: 0 }));

type ThumbState = { url?: string; pages?: number; locked?: boolean; failed?: boolean };

// One object URL per File for the page's lifetime. Revoking on unmount breaks
// under StrictMode's mount/unmount/mount cycle, and image files here are few.
const imageUrls = new WeakMap<File, string>();
function imageUrl(file: File) {
  let url = imageUrls.get(file);
  if (!url) {
    url = URL.createObjectURL(file);
    imageUrls.set(file, url);
  }
  return url;
}

function usePdfThumb(file: File, enabled: boolean): ThumbState {
  const [state, setState] = useState<ThumbState>({});
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    pdfThumbnail(file)
      .then((r) => !cancelled && setState("locked" in r ? { locked: true } : r))
      .catch(() => !cancelled && setState({ failed: true }));
    return () => {
      cancelled = true;
    };
  }, [file, enabled]);
  return state;
}

function Thumb({ file, rotation }: { file: File; rotation: number }) {
  const t = useT();
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const isImage = file.type.startsWith("image/");
  const pdf = usePdfThumb(file, isPdf);
  const state: ThumbState = isImage ? { url: imageUrl(file) } : pdf;

  const ext = file.name.split(".").pop()?.toUpperCase() ?? "FILE";
  return (
    <div className="relative flex h-44 items-center justify-center overflow-hidden rounded-md bg-bg">
      {state.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={state.url}
          alt=""
          className="max-h-40 max-w-[85%] shadow transition-transform"
          style={{ transform: `rotate(${rotation}deg)` }}
        />
      ) : state.locked ? (
        <span className="flex flex-col items-center gap-1 text-muted"><Icon name="lock" size={36} /> {t("Protected")}</span>
      ) : (
        <span className="flex h-24 w-20 items-center justify-center rounded border border-line bg-white text-sm font-bold text-muted">
          {state.failed ? "?" : ext}
        </span>
      )}
      {state.pages !== undefined && (
        <span className="absolute start-1.5 bottom-1.5 rounded bg-ink/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {state.pages === 1 ? t("1 page") : t("{n} pages", { n: state.pages })}
        </span>
      )}
    </div>
  );
}

function Card({
  item,
  index,
  canRotate,
  onRemove,
  onRotate,
  sortable,
}: {
  item: FileItem;
  index: number;
  canRotate: boolean;
  onRemove: () => void;
  onRotate: () => void;
  sortable: boolean;
}) {
  const t = useT();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: !sortable });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group relative w-52 rounded-xl border bg-white p-2.5 shadow-sm ${isDragging ? "z-10 border-brand shadow-xl" : "border-line"}`}
    >
      <div {...attributes} {...listeners} className={sortable ? "cursor-grab active:cursor-grabbing" : ""}>
        {/* Thumbnails render only when scrolled near, so 100 files don't all render at once. */}
        <LazyVisible height={176}>
          <Thumb file={item.file} rotation={item.rotation} />
        </LazyVisible>
      </div>
      <p className="mt-2 truncate px-1 text-sm font-medium" title={item.file.name}>{item.file.name}</p>
      <p className="px-1 text-xs text-muted">{formatBytes(item.file.size)}</p>
      <div className="absolute end-1 top-1 flex gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
        {canRotate && (
          <button onClick={onRotate} className="rounded-full bg-white p-1.5 shadow hover:text-brand" title={t("Rotate")}>
            <Icon name="rotate-clockwise" size={16} />
          </button>
        )}
        <button onClick={onRemove} className="rounded-full bg-white p-1.5 shadow hover:text-brand" title={t("Remove")}>
          <Icon name="x" size={16} />
        </button>
      </div>
      {sortable && (
        <span className="absolute start-2 top-2 rounded-full bg-ink/80 px-2 py-0.5 text-[10px] font-bold text-white">{index + 1}</span>
      )}
    </div>
  );
}

export function FileCards({
  items,
  setItems,
  canRotate,
  sortable,
  onAddMore,
  showSort,
}: {
  items: FileItem[];
  setItems: (items: FileItem[]) => void;
  canRotate: boolean;
  sortable: boolean;
  onAddMore?: () => void;
  showSort?: boolean;
}) {
  const t = useT();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = items.findIndex((i) => i.id === e.active.id);
    const to = items.findIndex((i) => i.id === e.over!.id);
    setItems(arrayMove(items, from, to));
  };

  return (
    <div>
      {(onAddMore || showSort) && (
        <div className="mb-4 flex justify-end gap-2">
          {showSort && (
            <button
              className="btn-secondary !py-2 text-sm"
              onClick={() => setItems([...items].sort((a, b) => a.file.name.localeCompare(b.file.name, undefined, { numeric: true })))}
            >
              <Icon name="sort-ascending-letters" size={18} /> {t("Sort A-Z")}
            </button>
          )}
        </div>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
          <div className="flex flex-wrap justify-center gap-4">
            {items.map((item, i) => (
              <Card
                key={item.id}
                item={item}
                index={i}
                sortable={sortable}
                canRotate={canRotate}
                onRemove={() => setItems(items.filter((x) => x.id !== item.id))}
                onRotate={() =>
                  setItems(items.map((x) => (x.id === item.id ? { ...x, rotation: (x.rotation + 90) % 360 } : x)))
                }
              />
            ))}
            {onAddMore && (
              <button
                onClick={onAddMore}
                className="flex h-[250px] w-52 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line text-muted hover:border-brand hover:text-brand"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-white">
                  <Icon name="plus" size={26} />
                </span>
                {t("Add more files")}
              </button>
            )}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
