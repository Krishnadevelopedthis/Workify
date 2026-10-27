"use client";

import type { PageViewport } from "pdfjs-dist";
import { useState } from "react";
import { useT } from "@/i18n/client";
import { Icon } from "../../Icon";
import { DrawLayer, PageNav, type Box } from "../DrawLayer";
import { Workspace } from "../GenericWorkspace";
import { PdfPage, rectToPdf, rectToScreen, useFitWidth, usePdf } from "../PdfPage";
import type { EditorProps } from "../ToolRunner";
import { IconInput } from "@/components/ui/IconInput";

type Area = { id: number; page: number; rect: ReturnType<typeof rectToPdf> };
let nextId = 0;

export default function RedactEditor({ tool, items, submit, error, setError }: EditorProps) {
  const t = useT();
  const { doc, error: loadError, numPages } = usePdf(items[0]?.file ?? null);
  const [page, setPage] = useState(1);
  const [vp, setVp] = useState<PageViewport | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [terms, setTerms] = useState<string[]>([]);
  const [term, setTerm] = useState("");
  const { measure: fitMeasure, width: fitWidth } = useFitWidth(760);

  const addArea = (b: Box) => vp && setAreas((a) => [...a, { id: ++nextId, page, rect: rectToPdf(vp, b.left, b.top, b.width, b.height) }]);
  const addTerm = () => {
    const value = term.trim();
    if (value && !terms.includes(value)) setTerms([...terms, value]);
    setTerm("");
  };

  function go() {
    if (!areas.length && !terms.length) return setError(t("Draw boxes over what you want to hide, or add text to search for."));
    submit([items[0].file], {
      redactions: {
        areas: areas.map((a) => ({ page: a.page, rect: [a.rect.x, a.rect.y, a.rect.x + a.rect.width, a.rect.y + a.rect.height] })),
        terms,
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
              <DrawLayer onBox={addArea} previewClass="bg-black/60">
                {vp &&
                  areas
                    .filter((a) => a.page === page)
                    .map((a) => (
                      <div key={a.id} className="group absolute bg-black/85" style={rectToScreen(vp, a.rect)}>
                        <button
                          onClick={() => setAreas((all) => all.filter((x) => x.id !== a.id))}
                          className="absolute -end-3 -top-3 hidden h-6 w-6 items-center justify-center rounded-full bg-brand text-white shadow group-hover:flex"
                          title={t("Remove")}
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
        <div className="space-y-5">
          <p className="rounded-lg bg-bg p-4 text-sm text-muted">
            {t("Drag over text or images to black them out. Redaction permanently removes the content underneath, it is not just covered.")}
          </p>
          <div>
            <p className="mb-2 text-sm font-semibold">{t("Search and redact text")}</p>
            <div className="flex gap-2">
              <IconInput
                icon="search"
                wrapperClassName="min-w-0 flex-1"
                placeholder={t("e.g. a name or account number")}
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTerm()}
              />
              <button className="btn-secondary !px-3" onClick={addTerm} title={t("Add")}>
                <Icon name="plus" size={18} />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {terms.map((word) => (
                <span key={word} className="flex items-center gap-1 rounded-full bg-ink px-3 py-1 text-xs text-white">
                  {word}
                  <button onClick={() => setTerms(terms.filter((x) => x !== word))} aria-label={t("Remove")}>
                    <Icon name="x" size={12} />
                  </button>
                </span>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted">{t("Every match on every page will be redacted.")}</p>
          </div>
          <div className="text-sm">
            <p className="font-semibold">{t("Marked areas")}</p>
            <p className="text-muted">
              {t("{areas} area(s) on {pages} page(s)", { areas: areas.length, pages: new Set(areas.map((a) => a.page)).size })}
            </p>
            {areas.length > 0 && (
              <button className="mt-1 font-medium text-brand underline" onClick={() => setAreas([])}>
                {t("Clear all areas")}
              </button>
            )}
          </div>
        </div>
      }
    />
  );
}
