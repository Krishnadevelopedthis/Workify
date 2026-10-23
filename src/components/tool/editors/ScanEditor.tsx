"use client";

import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import { imageToJpeg } from "@/lib/pdf-client";
import { Icon } from "../../Icon";
import { Workspace } from "../GenericWorkspace";
import { ErrorBanner, type EditorProps } from "../ToolRunner";

type Shot = { id: string; blob: Blob; url: string };
let n = 0;
const shot = (blob: Blob): Shot => ({ id: `s${++n}`, blob, url: URL.createObjectURL(blob) });

/** Optional "document" look: grayscale with stronger contrast, like a scanner. */
async function toJpeg(s: Shot, documentFilter: boolean): Promise<File> {
  const bmp = await createImageBitmap(s.blob);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext("2d")!;
  if (documentFilter) ctx.filter = "grayscale(1) contrast(1.6) brightness(1.1)";
  ctx.drawImage(bmp, 0, 0);
  const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.9));
  return new File([blob], `scan-${s.id}.jpg`, { type: "image/jpeg" });
}

function Camera({ onCapture, onClose }: { onCapture: (b: Blob) => void; onClose: () => void }) {
  const t = useT();
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let stream: MediaStream | null = null;
    // Browsers only expose the camera on HTTPS (or localhost).
    if (!navigator.mediaDevices?.getUserMedia) {
      queueMicrotask(() => setError(t("The live camera needs a secure (HTTPS) connection. Tap Done, then use “Choose photos” — it can open your camera too.")));
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } } })
      .then((s) => {
        stream = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch(() => setError(t("Camera access was blocked or no camera is available. Use “Choose photos” instead.")));
    return () => stream?.getTracks().forEach((track) => track.stop());
  }, [t]);

  function capture() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    c.toBlob((b) => b && onCapture(b), "image/jpeg", 0.92);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {error ? (
        <p className="m-auto max-w-sm text-center text-white">{error}</p>
      ) : (
        <video ref={video} autoPlay playsInline muted className="min-h-0 flex-1 object-contain" />
      )}
      <div className="flex items-center justify-between gap-4 p-5">
        <button onClick={onClose} className="rounded-full bg-white/15 px-5 py-3 font-semibold text-white">{t("Done")}</button>
        <button onClick={capture} disabled={!!error} className="h-16 w-16 rounded-full border-4 border-white bg-brand" aria-label={t("Take photo")} />
        <span className="w-20" />
      </div>
    </div>
  );
}

/** What the phone shows after scanning the QR code: capture and send pages. */
function PhoneScanner({ session }: { session: string }) {
  const t = useT();
  const [sent, setSent] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [camera, setCamera] = useState(false);

  async function send(blob: Blob) {
    setBusy(true);
    setError(undefined);
    const body = new FormData();
    // Re-encode as JPEG: fixes EXIF rotation, converts HEIC/WebP, and shrinks uploads.
    const jpeg = await imageToJpeg(new File([blob], "page", { type: blob.type })).catch(() => null);
    if (!jpeg) {
      setBusy(false);
      return setError(t("This photo format is not supported. Use JPG or PNG."));
    }
    body.append("page", jpeg, "page.jpg");
    const res = await fetch(`/api/scan/${session}`, { method: "POST", body });
    const data = (await res.json()) as { count?: number; error?: string };
    setBusy(false);
    if (!res.ok) return setError(data.error ?? t("Upload failed."));
    setSent(data.count ?? sent + 1);
  }

  return (
    <section className="flex flex-1 flex-col items-center px-6 py-14 text-center">
      <Icon name="scan" size={56} className="text-brand" />
      <h1 className="mt-4 text-2xl font-bold">{t("Scan pages to your computer")}</h1>
      <p className="mt-2 text-muted">{t("Each photo you take appears on your computer right away.")}</p>
      <ErrorBanner message={error} />
      <button onClick={() => setCamera(true)} className="btn-primary mt-8 w-full max-w-xs !py-4 text-lg">
        <Icon name="camera" size={22} /> {t("Open camera")}
      </button>
      <label className="btn-secondary mt-3 w-full max-w-xs cursor-pointer">
        <Icon name="photo" size={18} /> {t("Choose photos")}
        <input type="file" accept="image/*" multiple hidden onChange={async (e) => { for (const f of Array.from(e.target.files ?? [])) await send(f); e.target.value = ""; }} />
      </label>
      <p className="mt-6 text-lg font-semibold">{busy ? t("Sending…") : t("{n} page(s) sent", { n: sent })}</p>
      {camera && <Camera onCapture={send} onClose={() => setCamera(false)} />}
    </section>
  );
}

export default function ScanEditor({ tool, submit, error, setError }: EditorProps) {
  const t = useT();
  const [phoneSession] = useState(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("session")));
  const [shots, setShots] = useState<Shot[]>([]);
  const [camera, setCamera] = useState(false);
  const [docFilter, setDocFilter] = useState(true);
  const [qr, setQr] = useState<{ id: string; url: string; image: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fetched = useRef(new Set<string>());
  // Release every photo's object URL when leaving the editor.
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);
  const addShots = (blobs: Blob[]) => {
    const made = blobs.map(shot);
    urls.current.push(...made.map((s) => s.url));
    setShots((s) => [...s, ...made]);
  };
  const removeShot = (s: Shot) => {
    URL.revokeObjectURL(s.url);
    setShots((all) => all.filter((x) => x.id !== s.id));
  };

  // Start a phone session and poll it for pages sent from the phone.
  async function startPhone() {
    const res = await fetch("/api/scan", { method: "POST" });
    const data = (await res.json()) as { id: string; phoneUrl: string };
    setQr({ id: data.id, url: data.phoneUrl, image: await QRCode.toDataURL(data.phoneUrl, { width: 220, margin: 1 }) });
  }
  useEffect(() => {
    if (!qr) return;
    const started = Date.now();
    const timer = setInterval(async () => {
      // No requests while the tab is hidden; give up after the 30-minute session window.
      if (document.hidden) return;
      if (Date.now() - started > 30 * 60_000) return clearInterval(timer);
      const res = await fetch(`/api/scan/${qr.id}`).catch(() => null);
      if (!res?.ok) return;
      const { pages } = (await res.json()) as { pages: string[] };
      for (const url of pages) {
        if (fetched.current.has(url)) continue;
        fetched.current.add(url);
        const blob = await (await fetch(url)).blob();
        addShots([blob]);
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [qr]);

  if (phoneSession) return <PhoneScanner session={phoneSession} />;

  const move = (i: number, d: number) =>
    setShots((s) => {
      const j = i + d;
      if (j < 0 || j >= s.length) return s;
      const next = [...s];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  async function go() {
    if (!shots.length) return setError(t("Scan or add at least one page."));
    setBusy(true);
    try {
      const files = await Promise.all(shots.map((s) => toJpeg(s, docFilter)));
      submit(files, { size: "a4", orientation: "portrait", margin: "small", merge: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Workspace
        title={tool.name}
        error={error}
        action={busy ? t("Preparing…") : tool.action}
        disabled={busy}
        onAction={go}
        main={
          shots.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <Icon name="scan" size={64} className="text-brand" />
              <h1 className="mt-4 text-3xl font-bold">{tool.title}</h1>
              <p className="mt-2 max-w-lg text-muted">{tool.subtitle}</p>
              <p className="mt-6 text-sm text-muted">{t("Use the camera or your phone from the side panel.")}</p>
            </div>
          ) : (
            <div className="flex flex-wrap justify-center gap-4">
              {shots.map((s, i) => (
                <div key={s.id} className="w-44 rounded-xl border border-line bg-white p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.url} alt={t("Page {n}", { n: i + 1 })} className="h-56 w-full rounded object-contain" style={docFilter ? { filter: "grayscale(1) contrast(1.6) brightness(1.1)" } : undefined} />
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="font-semibold">{i + 1}</span>
                    <span className="flex gap-1">
                      <button onClick={() => move(i, -1)} className="rounded p-1 hover:bg-bg" aria-label={t("Move left")}><Icon name="arrow-left" size={16} /></button>
                      <button onClick={() => move(i, 1)} className="rounded p-1 hover:bg-bg" aria-label={t("Move right")}><Icon name="arrow-right" size={16} /></button>
                      <button onClick={() => removeShot(s)} className="rounded p-1 text-brand hover:bg-bg" aria-label={t("Delete")}><Icon name="trash" size={16} /></button>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )
        }
        sidebar={
          <div className="space-y-5">
            <button className="btn-primary w-full" onClick={() => setCamera(true)}>
              <Icon name="camera" size={20} /> {t("Scan with this device")}
            </button>
            <label className="btn-secondary w-full cursor-pointer">
              <Icon name="photo" size={18} /> {t("Add photos")}
              <input type="file" accept="image/*" multiple hidden onChange={(e) => { addShots(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
            </label>
            <div className="rounded-xl border border-line p-4 text-center">
              <p className="flex items-center justify-center gap-2 text-sm font-semibold"><Icon name="device-mobile" size={18} /> {t("Scan with your phone")}</p>
              {qr ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qr.image} alt={t("QR code to open the scanner on your phone")} className="mx-auto mt-3 h-44 w-44" />
                  <p className="mt-2 text-xs text-muted">{t("Scan this QR code with your phone camera. Your phone must be on the same network. Pages appear here automatically.")}</p>
                  <p className="mt-1 text-[11px] break-all text-muted">{qr.url}</p>
                </>
              ) : (
                <button className="btn-secondary mt-3 w-full" onClick={startPhone}><Icon name="qrcode" size={18} /> {t("Show QR code")}</button>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={docFilter} onChange={(e) => setDocFilter(e.target.checked)} />
              {t("Document filter (black & white, sharper text)")}
            </label>
            <p className="text-center text-sm text-muted">{t("{n} pages", { n: shots.length })}</p>
          </div>
        }
      />
      {camera && <Camera onCapture={(b) => addShots([b])} onClose={() => setCamera(false)} />}
    </>
  );
}
