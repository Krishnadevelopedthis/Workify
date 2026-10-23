"use client";

import { useMemo, useState } from "react";
import { useT } from "@/i18n/client";
import { Icon } from "../../Icon";
import { Workspace } from "../GenericWorkspace";
import { LazyVisible, PdfPage, usePdf } from "../PdfPage";
import type { EditorProps } from "../ToolRunner";

/** [1,2,3,5] -> "1-3, 5" */
export function toRanges(pages: number[]) {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j > i ? `${sorted[i]}-${sorted[j]}` : `${sorted[i]}`);
    i = j;
  }
  return parts.join(", ");
}

/** "1-3, 5" -> {1,2,3,5}, ignoring anything outside 1..total; null when the text is not valid. */
export function fromRanges(text: string, total: number): Set<number> | null {
  const out = new Set<number>();
  for (const part of text.split(",").map((p) => p.trim()).filter(Boolean)) {
    const m = /^(\d+)\s*(?:-\s*(\d+))?$/.exec(part);
    if (!m) return null;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let p = Math.max(1, Math.min(a, b)); p <= Math.min(total, Math.max(a, b)); p++) out.add(p);
  }
  return out;
}

/** Remove pages / Extract pages: click thumbnails (or type ranges) to choose pages. */
export default function PagesEditor({ tool, items, submit, error, setError }: EditorProps) {
  const t = useT();
  const file = items[0].file;
  const { doc, error: loadError, numPages } = usePdf(file);
  const removing = tool.slug === "remove-pages";
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [text, setText] = useState("");
  const [separate, setSeparate] = useState(false);
  const pages = useMemo(() => Array.from({ length: numPages }, (_, i) => i + 1), [numPages]);

  const choose = (next: Set<number>) => {
    setSelected(next);
    setText(toRanges([...next]));
  };
  const toggle = (p: number) => {
    const next = new Set(selected);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    choose(next);
  };

  function go() {
    if (!selected.size) return setError(removing ? t("Choose the pages you want to remove.") : t("Choose the pages you want to extract."));
    if (removing && selected.size >= numPages) return setError(t("You can't remove every page. Keep at least one page."));
    submit([file], { pages: toRanges([...selected]), separate });
  }

  return (
    <Workspace
      title={tool.name}
      error={error ?? (loadError ? t(loadError) : undefined)}
      action={tool.action}
      onAction={go}
      main={
        <div className="flex flex-wrap justify-center gap-4">
          {doc &&
            pages.map((p) => {
              const on = selected.has(p);
              return (
                <button
                  key={p}
                  onClick={() => toggle(p)}
                  aria-pressed={on}
                  className={`relative flex w-40 flex-col items-center rounded-xl border-2 bg-white p-2 transition ${
                    on ? (removing ? "border-brand" : "border-[#2d7ff9]") : "border-transparent hover:border-line"
                  }`}
                >
                  <div className="flex h-48 w-full items-center justify-center overflow-hidden">
                    <LazyVisible height={180} className="flex w-full items-center justify-center">
                      <PdfPage doc={doc} pageNumber={p} width={130} className={on && removing ? "opacity-40" : ""} />
                    </LazyVisible>
                  </div>
                  <span className="mt-1 text-xs font-semibold">{p}</span>
                  {on && (
                    <span className={`absolute end-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-white ${removing ? "bg-brand" : "bg-[#2d7ff9]"}`}>
                      <Icon name={removing ? "x" : "check"} size={16} />
                    </span>
                  )}
                </button>
              );
            })}
          {!doc && !loadError && <p className="p-10 text-muted">{t("Loading pages…")}</p>}
        </div>
      }
      sidebar={
        <div className="space-y-5">
          <p className="rounded-lg bg-bg p-4 text-sm text-muted">
            {removing
              ? t("Click the pages you want to delete, or type their numbers below.")
              : t("Click the pages you want to keep, or type their numbers below.")}
          </p>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">{removing ? t("Pages to remove") : t("Pages to extract")}</span>
            <input
              className="input"
              value={text}
              placeholder="1, 3-5"
              onChange={(e) => {
                setText(e.target.value);
                const parsed = fromRanges(e.target.value, numPages);
                if (parsed) setSelected(parsed);
              }}
            />
            <span className="mt-1 block text-xs text-muted">
              {t("{n} of {total} pages selected", { n: selected.size, total: numPages })}
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => choose(new Set(pages))}>{t("All")}</button>
            <button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => choose(new Set(pages.filter((p) => p % 2 === 1)))}>{t("Odd pages")}</button>
            <button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => choose(new Set(pages.filter((p) => p % 2 === 0)))}>{t("Even pages")}</button>
            <button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => choose(new Set())}>{t("None")}</button>
          </div>
          {!removing && (
            <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium">
              <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={separate} onChange={(e) => setSeparate(e.target.checked)} />
              {t("Save each page as a separate PDF")}
            </label>
          )}
        </div>
      }
    />
  );
}
