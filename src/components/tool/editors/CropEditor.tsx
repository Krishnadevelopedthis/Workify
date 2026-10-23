"use client";

import type { PageViewport } from "pdfjs-dist";
import { useState } from "react";
import { useT } from "@/i18n/client";
import { DrawLayer, PageNav, type Box } from "../DrawLayer";
import { Workspace } from "../GenericWorkspace";
import { PdfPage, rectToPdf, rectToScreen, useFitWidth, usePdf } from "../PdfPage";
import type { EditorProps } from "../ToolRunner";

export default function CropEditor({ tool, items, submit, error, setError }: EditorProps) {
  const t = useT();
  const { doc, error: loadError, numPages } = usePdf(items[0]?.file ?? null);
  const [page, setPage] = useState(1);
  // Stored in PDF points so the selection survives resizes and page changes.
  const [pdfBox, setPdfBox] = useState<ReturnType<typeof rectToPdf> | null>(null);
  const [vp, setVp] = useState<PageViewport | null>(null);
  const [apply, setApply] = useState<"all" | "current">("all");
  const { measure: fitMeasure, width: fitWidth } = useFitWidth(760);
  const box: Box | null = pdfBox && vp ? rectToScreen(vp, pdfBox) : null;
  const onBox = (b: Box) => vp && setPdfBox(rectToPdf(vp, b.left, b.top, b.width, b.height));

  function go() {
    if (!pdfBox) return setError(t("Drag on the page to select the area you want to keep."));
    submit([items[0].file], { box: pdfBox, apply, page });
  }

  return (
    <Workspace
      title={tool.name}
      error={error ?? (loadError ? t(loadError) : undefined)}
      action={tool.action}
      onAction={go}
      main={
        <div ref={fitMeasure} className="flex flex-col items-center">
          <PageNav page={page} total={numPages} onPage={(p) => setPage(p)} />
          {doc && (
            <PdfPage doc={doc} pageNumber={page} width={fitWidth} onViewport={setVp}>
              {/* Dim everything outside the selection. */}
              {box && (
                <div
                  className="pointer-events-none absolute border-2 border-brand"
                  style={{ ...box, boxShadow: "0 0 0 9999px rgba(20,20,30,.45)" }}
                />
              )}
              <DrawLayer onBox={onBox} previewClass="border-2 border-dashed border-brand" />
            </PdfPage>
          )}
        </div>
      }
      sidebar={
        <div className="space-y-5">
          <p className="rounded-lg bg-bg p-4 text-sm text-muted">
            {t("Drag on the page to draw the area you want to keep. Everything outside it is cropped away.")}
          </p>
          <div>
            <p className="mb-2 text-sm font-semibold">{t("Apply to")}</p>
            <div className="grid grid-cols-2 gap-2">
              {(["all", "current"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setApply(v)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${apply === v ? "border-brand bg-brand/5 text-brand" : "border-line"}`}
                >
                  {v === "all" ? t("All pages") : t("Current page")}
                </button>
              ))}
            </div>
          </div>
          {pdfBox && (
            <p className="text-xs text-muted">
              {t("Selection: {w} × {h} pt", { w: Math.round(pdfBox.width), h: Math.round(pdfBox.height) })}
            </p>
          )}
          <button className="text-sm font-medium text-brand underline" onClick={() => setPdfBox(null)}>
            {t("Reset selection")}
          </button>
        </div>
      }
    />
  );
}
