"use client";

import type { PageViewport } from "pdfjs-dist";
import { useState, type ReactNode } from "react";
import { Icon } from "../Icon";
import { PageNav } from "./DrawLayer";
import { Workspace } from "./GenericWorkspace";
import { elId, ElementsLayer, toOverlay, type El } from "./overlay";
import { PdfPage, toPdf, useFitWidth, usePdf } from "./PdfPage";
import { SignatureModal, type SignatureImage } from "./SignatureModal";

type Placeable = "signature" | "initials" | "name" | "date" | "text" | "stamp";

const FIELDS: { id: Placeable; icon: string; label: string }[] = [
  { id: "signature", icon: "signature", label: "Signature" },
  { id: "initials", icon: "letter-case", label: "Initials" },
  { id: "name", icon: "user", label: "Name" },
  { id: "date", icon: "calendar", label: "Date" },
  { id: "text", icon: "typography", label: "Text" },
  { id: "stamp", icon: "photo", label: "Company stamp" },
];

export function SignWorkspace({
  file,
  title,
  action,
  error,
  setError,
  sidebarTop,
  onSubmit,
}: {
  file: File;
  title: string;
  action: string;
  error?: string;
  setError: (m: string) => void;
  sidebarTop?: ReactNode;
  onSubmit: (overlays: ReturnType<typeof toOverlay>[], extras: Record<string, Blob>) => void;
}) {
  const { doc, error: loadError, numPages } = usePdf(file);
  const [page, setPage] = useState(1);
  const [vp, setVp] = useState<PageViewport | null>(null);
  const [name, setName] = useState("");
  const [sigs, setSigs] = useState<Partial<Record<"signature" | "initials" | "stamp", SignatureImage>>>({});
  const [modal, setModal] = useState<"signature" | "initials" | null>(null);
  const [placing, setPlacing] = useState<Placeable | null>(null);
  const [elements, setElements] = useState<El[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const { measure: fitMeasure, width: fitWidth } = useFitWidth(820);

  const sel = elements.find((e) => e.id === selected);
  const update = (el: El) => setElements((all) => all.map((x) => (x.id === el.id ? el : x)));

  function choose(f: Placeable) {
    if ((f === "signature" || f === "initials") && !sigs[f]) return setModal(f);
    if (f === "stamp" && !sigs.stamp) {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/png,image/jpeg";
      input.onchange = async () => {
        const f0 = input.files?.[0];
        if (!f0) return;
        const bmp = await createImageBitmap(f0);
        setSigs((s) => ({ ...s, stamp: { blob: f0, url: URL.createObjectURL(f0), width: bmp.width, height: bmp.height } }));
        setPlacing("stamp");
      };
      input.click();
      return;
    }
    setPlacing(f);
  }

  function place(e: React.PointerEvent<HTMLDivElement>) {
    if (!placing || !vp) return;
    const r = e.currentTarget.getBoundingClientRect();
    const [x, y] = toPdf(vp, e.clientX - r.left, e.clientY - r.top);
    const id = elId();
    if (placing === "signature" || placing === "initials" || placing === "stamp") {
      const img = sigs[placing]!;
      const w = placing === "initials" ? 60 : placing === "stamp" ? 110 : 150;
      const h = (w / img.width) * img.height;
      setElements((a) => [...a, { id, page, kind: "image", x: x - w / 2, y: y - h / 2, w, h, image: placing, url: img.url }]);
    } else {
      const text =
        placing === "date" ? new Date().toLocaleDateString() : placing === "name" ? name || "Your name" : "Text";
      setElements((a) => [...a, { id, page, kind: "text", x, y, text, size: 14, color: "#1b1b1f", font: "Helvetica", bold: false }]);
    }
    setSelected(id);
    setPlacing(null);
  }

  function go() {
    if (!elements.length) return setError("Place your signature on the document first.");
    const extras: Record<string, Blob> = {};
    for (const k of ["signature", "initials", "stamp"] as const) {
      if (sigs[k] && elements.some((e) => e.kind === "image" && e.image === k)) extras[k] = sigs[k]!.blob;
    }
    onSubmit(elements.map(toOverlay), extras);
  }

  return (
    <>
      <Workspace
        title={title}
        error={error ?? loadError ?? undefined}
        action={action}
        onAction={go}
        main={
          <div ref={fitMeasure} className="flex flex-col items-center">
            {placing && (
              <p className="sticky top-2 z-20 mb-3 rounded-full bg-ink px-4 py-2 text-sm text-white shadow">
                Click on the page where you want to place it ·{" "}
                <button className="underline" onClick={() => setPlacing(null)}>Cancel</button>
              </p>
            )}
            <PageNav page={page} total={numPages} onPage={(p) => { setPage(p); setSelected(null); }} />
            {doc && (
              <PdfPage doc={doc} pageNumber={page} width={fitWidth} onViewport={setVp}>
                {vp && (
                  <>
                    {placing && <div className="absolute inset-0 z-10 cursor-copy" onPointerDown={place} />}
                    <ElementsLayer
                      vp={vp}
                      elements={elements.filter((e) => e.page === page)}
                      selectedId={selected}
                      interactive={!placing}
                      onSelect={setSelected}
                      onChange={update}
                    />
                  </>
                )}
              </PdfPage>
            )}
          </div>
        }
        sidebar={
          <div className="space-y-5">
            {sidebarTop}
            <label className="block text-sm">
              <span className="mb-1 block font-semibold">Full name</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" />
            </label>
            <div>
              <p className="mb-2 text-sm font-semibold">Fields</p>
              <div className="grid gap-2">
                {FIELDS.map((f) => {
                  const img = f.id === "signature" || f.id === "initials" || f.id === "stamp" ? sigs[f.id] : undefined;
                  return (
                    <div key={f.id} className="flex items-center gap-2">
                      <button
                        onClick={() => choose(f.id)}
                        className={`flex flex-1 items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm font-medium ${placing === f.id ? "border-brand bg-brand/5" : "border-line hover:border-ink/30"}`}
                      >
                        <Icon name={f.icon} size={18} className="text-brand" />
                        <span className="flex-1">{f.label}</span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {img && <img src={img.url} alt="" className="h-6 max-w-20 object-contain" />}
                      </button>
                      {(f.id === "signature" || f.id === "initials") && sigs[f.id] && (
                        <button onClick={() => setModal(f.id as "signature" | "initials")} className="rounded-lg border border-line p-2 hover:border-ink/30" title="Change">
                          <Icon name="pencil" size={16} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            {sel?.kind === "text" && (
              <label className="block text-sm">
                <span className="mb-1 block font-semibold">Selected text</span>
                <input className="input" value={sel.text} onChange={(e) => update({ ...sel, text: e.target.value })} />
              </label>
            )}
            {sel && (
              <button className="btn-secondary w-full !text-brand" onClick={() => { setElements((a) => a.filter((x) => x.id !== sel.id)); setSelected(null); }}>
                <Icon name="trash" size={18} /> Remove selected
              </button>
            )}
          </div>
        }
      />
      {modal && (
        <SignatureModal
          title={modal === "signature" ? "Create your signature" : "Create your initials"}
          defaultText={modal === "signature" ? name : name.split(/\s+/).map((w) => w[0] ?? "").join("").toUpperCase()}
          onClose={() => setModal(null)}
          onDone={(img) => {
            const old = sigs[modal];
            if (old) URL.revokeObjectURL(old.url); // the replaced image is no longer shown
            setSigs((s) => ({ ...s, [modal]: img }));
            // Re-point already placed copies at the new image.
            setElements((a) => a.map((e) => (e.kind === "image" && e.image === modal ? { ...e, url: img.url, h: (e.w / img.width) * img.height } : e)));
            setPlacing(modal);
            setModal(null);
          }}
        />
      )}
    </>
  );
}
