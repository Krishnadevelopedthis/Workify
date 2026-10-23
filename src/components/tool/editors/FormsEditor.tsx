"use client";

import type { PageViewport } from "pdfjs-dist";
import { useEffect, useState } from "react";
import { useLang, useT } from "@/i18n/client";
import { Icon } from "../../Icon";
import { DrawLayer, PageNav, type Box } from "../DrawLayer";
import { Workspace } from "../GenericWorkspace";
import { PdfPage, rectToPdf, rectToScreen, useFitWidth, usePdf } from "../PdfPage";
import type { EditorProps } from "../ToolRunner";

type PdfRect = { x: number; y: number; width: number; height: number };
type Existing = { name: string; type: string; page: number; rect: PdfRect; options?: string[]; exportValue?: string };
type NewField = { id: number; page: number; kind: "text" | "checkbox"; name: string; rect: PdfRect };
let nextId = 0;

const fromArray = ([x0, y0, x1, y1]: number[]): PdfRect => ({
  x: Math.min(x0, x1),
  y: Math.min(y0, y1),
  width: Math.abs(x1 - x0),
  height: Math.abs(y1 - y0),
});

export default function FormsEditor({ tool, items, submit, error, setError }: EditorProps) {
  const t = useT();
  const lang = useLang();
  const file = items[0]?.file ?? null;
  const { doc, error: loadError, numPages } = usePdf(file);
  const [page, setPage] = useState(1);
  const [vp, setVp] = useState<PageViewport | null>(null);
  const [existing, setExisting] = useState<Existing[]>([]);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [created, setCreated] = useState<NewField[]>([]);
  const [mode, setMode] = useState<"text" | "checkbox">("text");
  const [flatten, setFlatten] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const { measure: fitMeasure, width: fitWidth } = useFitWidth(760);

  // Read the PDF's existing fillable fields.
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    (async () => {
      const found: Existing[] = [];
      const initial: Record<string, string | boolean> = {};
      for (let p = 1; p <= doc.numPages; p++) {
        const annots = await (await doc.getPage(p)).getAnnotations();
        for (const a of annots) {
          if (a.subtype !== "Widget" || !a.fieldName || found.some((f) => f.name === a.fieldName)) continue;
          const type = a.checkBox ? "checkbox" : a.radioButton ? "radio" : a.fieldType === "Ch" ? "choice" : "text";
          found.push({
            name: a.fieldName,
            type,
            page: p,
            rect: fromArray(a.rect),
            options: a.options?.map((o: { displayValue: string }) => o.displayValue),
            exportValue: a.exportValue,
          });
          initial[a.fieldName] = type === "checkbox" ? a.fieldValue === a.exportValue : (a.fieldValue ?? "");
        }
      }
      if (!cancelled) {
        setExisting(found);
        setValues(initial);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc]);

  const addField = (b: Box) => {
    if (!vp) return;
    const rect = rectToPdf(vp, b.left, b.top, b.width, b.height);
    if (mode === "checkbox") rect.width = rect.height = Math.max(10, Math.min(rect.width, rect.height));
    setCreated((c) => [...c, { id: ++nextId, page, kind: mode, name: `${mode}_${c.length + 1}`, rect }]);
  };

  async function detect() {
    if (!file) return;
    setDetecting(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/detect-fields", { method: "POST", body, headers: { "x-wf-lang": lang } });
      const data = (await res.json()) as { fields?: { page: number; rect: number[]; kind: "text" | "checkbox" }[]; error?: string };
      if (!res.ok) return setError(data.error ?? t("Detection failed."));
      if (!data.fields?.length) return setError(t("No form fields were detected. Draw them on the page instead."));
      setCreated((c) => [
        ...c,
        ...data.fields!.map((f, i) => ({ id: ++nextId, page: f.page, kind: f.kind, name: `${f.kind}_${c.length + i + 1}`, rect: fromArray(f.rect) })),
      ]);
    } finally {
      setDetecting(false);
    }
  }

  function go() {
    if (!created.length && !Object.keys(values).length) {
      return setError(t("This PDF has no form fields yet. Detect or draw some first."));
    }
    submit([items[0].file], {
      form: {
        fill: values,
        create: created.map((f) => ({ page: f.page, kind: f.kind, name: f.name, x: f.rect.x, y: f.rect.y, w: f.rect.width, h: f.rect.height })),
        flatten,
      },
    });
  }

  return (
    <Workspace
      title={tool.name}
      error={error ?? (loadError ? t(loadError) : undefined)}
      action={tool.action}
      onAction={go}
      main={
        <div ref={fitMeasure} className="flex flex-col items-center">
          <PageNav page={page} total={numPages} onPage={setPage} />
          {doc && (
            <PdfPage doc={doc} pageNumber={page} width={fitWidth} onViewport={setVp}>
              <DrawLayer onBox={addField} previewClass="border-2 border-dashed border-[#2d7ff9] bg-[#2d7ff9]/10">
                {vp &&
                  existing
                    .filter((f) => f.page === page)
                    .map((f) => (
                      <div key={f.name} title={f.name} className="pointer-events-none absolute border-2 border-[#2d7ff9]/70 bg-[#2d7ff9]/10" style={rectToScreen(vp, f.rect)} />
                    ))}
                {vp &&
                  created
                    .filter((f) => f.page === page)
                    .map((f) => (
                      <div key={f.id} className="group absolute border-2 border-brand bg-brand/10" style={rectToScreen(vp, f.rect)}>
                        <span className="absolute start-0 -top-5 rounded bg-brand px-1 text-[10px] whitespace-nowrap text-white">{f.name}</span>
                        <button
                          onClick={() => setCreated((all) => all.filter((x) => x.id !== f.id))}
                          className="absolute -end-3 -top-3 hidden h-6 w-6 items-center justify-center rounded-full bg-brand text-white shadow group-hover:flex"
                          title={t("Remove field")}
                        >
                          <Icon name="x" size={14} />
                        </button>
                      </div>
                    ))}
              </DrawLayer>
            </PdfPage>
          )}
        </div>
      }
      sidebar={
        <div className="space-y-6">
          <div>
            <p className="mb-2 text-sm font-semibold">{t("Create fields")}</p>
            <button className="btn-secondary w-full" onClick={detect} disabled={detecting}>
              <Icon name="sparkles" size={18} /> {detecting ? t("Detecting…") : t("Detect form fields automatically")}
            </button>
            <p className="mt-3 mb-2 text-xs text-muted">{t("Or pick a field type and drag on the page:")}</p>
            <div className="grid grid-cols-2 gap-2">
              {(["text", "checkbox"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium ${mode === m ? "border-brand bg-brand/5 text-brand" : "border-line"}`}
                >
                  <Icon name={m === "text" ? "forms" : "checkbox"} size={16} /> {m === "text" ? t("Text field") : t("Checkbox")}
                </button>
              ))}
            </div>
            {created.length > 0 && (
              <div className="mt-3 space-y-2">
                {created.map((f) => (
                  <div key={f.id} className="flex items-center gap-2">
                    <span className="w-8 shrink-0 text-xs text-muted">p{f.page}</span>
                    <input
                      className="input !py-1 text-sm"
                      value={f.name}
                      onChange={(e) => setCreated((all) => all.map((x) => (x.id === f.id ? { ...x, name: e.target.value } : x)))}
                      aria-label={t("Field name")}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold">{t("Fill existing fields")}</p>
            {existing.length === 0 ? (
              <p className="text-xs text-muted">{t("This PDF has no fillable fields yet.")}</p>
            ) : (
              <div className="space-y-3">
                {existing.map((f) => (
                  <label key={f.name} className="block text-sm">
                    <span className="mb-1 block text-xs text-muted">{f.name}</span>
                    {f.type === "checkbox" ? (
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--brand)]"
                        checked={Boolean(values[f.name])}
                        onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.checked }))}
                      />
                    ) : f.type === "choice" && f.options?.length ? (
                      <select className="input" value={String(values[f.name] ?? "")} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}>
                        <option value="">—</option>
                        {f.options.map((o) => <option key={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input className="input" value={String(values[f.name] ?? "")} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))} />
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={flatten} onChange={(e) => setFlatten(e.target.checked)} />
            {t("Flatten form (make fields non-editable)")}
          </label>
        </div>
      }
    />
  );
}
