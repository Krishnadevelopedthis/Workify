"use client";

import { diffArrays } from "diff";
import type { PDFDocumentProxy, PageViewport } from "pdfjs-dist";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../Icon";
import { PageNav } from "../DrawLayer";
import { PdfPage, useFitWidth, usePdf } from "../PdfPage";
import { ErrorBanner, type EditorProps } from "../ToolRunner";

type Item = { page: number; text: string; x: number; y: number; w: number; h: number };
type Mark = Item & { kind: "added" | "removed" };

/** Text runs of every page, with their PDF-space boxes. */
async function textItems(doc: PDFDocumentProxy): Promise<Item[]> {
  const out: Item[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    for (const it of content.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const [, , , d, e, f] = it.transform as number[];
      out.push({ page: p, text: it.str.trim().replace(/\s+/g, " "), x: e, y: f, w: it.width, h: Math.abs(d) || it.height });
    }
  }
  return out;
}

function diffItems(a: Item[], b: Item[]) {
  const changes = diffArrays(a.map((i) => i.text), b.map((i) => i.text));
  const marksA: Mark[] = [];
  const marksB: Mark[] = [];
  let ia = 0;
  let ib = 0;
  for (const c of changes) {
    const n = c.count ?? c.value.length;
    if (c.removed) for (let k = 0; k < n; k++) marksA.push({ ...a[ia++], kind: "removed" });
    else if (c.added) for (let k = 0; k < n; k++) marksB.push({ ...b[ib++], kind: "added" });
    else {
      ia += n;
      ib += n;
    }
  }
  return { marksA, marksB };
}

function Highlights({ vp, marks }: { vp: PageViewport; marks: Mark[] }) {
  return (
    <>
      {marks.map((m, i) => {
        const [x0, y0] = vp.convertToViewportPoint(m.x, m.y) as [number, number];
        const [x1, y1] = vp.convertToViewportPoint(m.x + m.w, m.y + m.h) as [number, number];
        return (
          <div
            key={i}
            title={`${m.kind === "added" ? "Added" : "Removed"}: ${m.text}`}
            className={`absolute rounded-sm ${m.kind === "added" ? "bg-[#6aa84f]/35 ring-1 ring-[#6aa84f]" : "bg-brand/30 ring-1 ring-brand"}`}
            style={{ left: Math.min(x0, x1) - 1, top: Math.min(y0, y1) - 2, width: Math.abs(x1 - x0) + 2, height: Math.abs(y1 - y0) + 4 }}
          />
        );
      })}
    </>
  );
}

function Side({ label, doc, page, width, marks }: { label: string; doc: PDFDocumentProxy | null; page: number; width: number; marks: Mark[] }) {
  const [vp, setVp] = useState<PageViewport | null>(null);
  return (
    <div className="flex flex-col items-center">
      <p className="mb-2 max-w-full truncate text-sm font-semibold">{label}</p>
      {doc && page <= doc.numPages ? (
        <PdfPage doc={doc} pageNumber={page} width={width} onViewport={setVp}>
          {vp && <Highlights vp={vp} marks={marks.filter((m) => m.page === page)} />}
        </PdfPage>
      ) : (
        <div className="flex items-center justify-center rounded border border-dashed border-line bg-white text-sm text-muted" style={{ width, height: width * 1.3 }}>
          {doc ? "No such page" : "Loading…"}
        </div>
      )}
    </div>
  );
}

export default function CompareEditor({ tool, items, setItems, addFiles, error }: EditorProps) {
  const [a, b] = [items[0]?.file ?? null, items[1]?.file ?? null];
  const docA = usePdf(a);
  const docB = usePdf(b);
  const [page, setPage] = useState(1);
  const [mode, setMode] = useState<"text" | "overlay">("text");
  const [marks, setMarks] = useState<{ marksA: Mark[]; marksB: Mark[] } | null>(null);
  const { measure: fitMeasure, width: fitWidth } = useFitWidth(1400);
  const half = Math.max(260, Math.floor((fitWidth - 24) / 2));

  useEffect(() => {
    if (!docA.doc || !docB.doc) return;
    let cancelled = false;
    Promise.all([textItems(docA.doc), textItems(docB.doc)]).then(([ia, ib]) => {
      if (!cancelled) setMarks(diffItems(ia, ib));
    });
    return () => {
      cancelled = true;
    };
  }, [docA.doc, docB.doc]);

  const total = Math.max(docA.numPages, docB.numPages);
  const changesByPage = useMemo(() => {
    const m = new Map<number, number>();
    for (const x of [...(marks?.marksA ?? []), ...(marks?.marksB ?? [])]) m.set(x.page, (m.get(x.page) ?? 0) + 1);
    return m;
  }, [marks]);

  if (items.length < 2) {
    return (
      <section className="flex flex-1 flex-col items-center px-4 pt-14 pb-20 text-center">
        <h1 className="text-3xl font-bold">{tool.title}</h1>
        <p className="mt-3 text-muted">Now select the second PDF to compare with “{items[0]?.file.name}”.</p>
        <label className="btn-primary mt-8 cursor-pointer !px-10 !py-5 text-lg">
          Select second PDF
          <input type="file" accept=".pdf,application/pdf" hidden onChange={(e) => e.target.files?.[0] && addFiles([e.target.files[0]])} />
        </label>
      </section>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-bg">
      <div className="sticky top-16 z-20 flex flex-wrap items-center justify-center gap-3 border-b border-line bg-white px-4 py-3">
        <div className="flex rounded-lg border border-line p-1">
          {(["text", "overlay"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`rounded-md px-4 py-1.5 text-sm font-semibold ${mode === m ? "bg-ink text-white" : ""}`}>
              {m === "text" ? "Semantic text" : "Content overlay"}
            </button>
          ))}
        </div>
        <span className="flex items-center gap-1.5 text-sm"><span className="h-3 w-3 rounded-sm bg-brand/50" /> Removed</span>
        <span className="flex items-center gap-1.5 text-sm"><span className="h-3 w-3 rounded-sm bg-[#6aa84f]/60" /> Added</span>
        <span className="text-sm text-muted">
          {marks ? `${marks.marksA.length + marks.marksB.length} changes found` : "Comparing…"}
        </span>
        <button className="btn-secondary !py-1.5 text-sm" onClick={() => setItems([...items].reverse())}>
          <Icon name="arrows-split-2" size={16} /> Swap files
        </button>
      </div>
      <ErrorBanner message={error ?? docA.error ?? docB.error ?? undefined} />
      <div ref={fitMeasure} className="flex flex-1 flex-col items-center p-4 sm:p-6">
        <PageNav page={page} total={total} onPage={setPage} />
        {total > 1 && changesByPage.size > 0 && (
          <div className="mb-4 flex flex-wrap justify-center gap-1.5 text-xs">
            {[...changesByPage.entries()].sort((x, y) => x[0] - y[0]).map(([p, n]) => (
              <button key={p} onClick={() => setPage(p)} className={`rounded-full px-2.5 py-1 ${p === page ? "bg-brand text-white" : "bg-white"}`}>
                p{p}: {n}
              </button>
            ))}
          </div>
        )}
        {mode === "text" ? (
          <div className="flex flex-wrap justify-center gap-6">
            <Side label={a!.name} doc={docA.doc} page={page} width={half} marks={marks?.marksA ?? []} />
            <Side label={b!.name} doc={docB.doc} page={page} width={half} marks={marks?.marksB ?? []} />
          </div>
        ) : (
          docA.doc && docB.doc && (
            <div className="relative">
              <p className="mb-2 text-center text-sm text-muted">Identical content fades to white; anything that differs stays visible.</p>
              {/* difference blend turns identical pixels black; invert makes them white again */}
              <div className="relative isolate invert">
                {page <= docA.numPages && <PdfPage doc={docA.doc} pageNumber={page} width={Math.min(fitWidth, 820)} />}
                {page <= docB.numPages && (
                  <div className="absolute inset-0 mix-blend-difference">
                    <PdfPage doc={docB.doc} pageNumber={page} width={Math.min(fitWidth, 820)} />
                  </div>
                )}
              </div>
            </div>
          )
        )}
        {marks && mode === "text" && (
          <div className="mt-8 w-full max-w-4xl rounded-xl border border-line bg-white p-5">
            <h2 className="mb-3 font-bold">Changes on page {page}</h2>
            {[...marks.marksA, ...marks.marksB].filter((m) => m.page === page).length === 0 ? (
              <p className="text-sm text-muted">No text changes on this page.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {[...marks.marksA, ...marks.marksB]
                  .filter((m) => m.page === page)
                  .map((m, i) => (
                    <li key={i} className="flex gap-2">
                      <span className={`shrink-0 rounded px-1.5 text-xs font-bold text-white ${m.kind === "added" ? "bg-[#6aa84f]" : "bg-brand"}`}>
                        {m.kind === "added" ? "+" : "−"}
                      </span>
                      <span className={m.kind === "removed" ? "line-through decoration-brand/60" : ""}>{m.text}</span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
