"use client";

import { Caveat, Dancing_Script, Great_Vibes } from "next/font/google";
import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";

// Only the signature modal uses these, so they must not be preloaded on every page.
const dancing = Dancing_Script({ subsets: ["latin"], weight: "600", preload: false });
const vibes = Great_Vibes({ subsets: ["latin"], weight: "400", preload: false });
const caveat = Caveat({ subsets: ["latin"], weight: "600", preload: false });
const FONTS = [dancing, vibes, caveat];
const INK = ["#1b1b1f", "#1d4ed8", "#e5322d"];

/** Trims transparent edges so the signature image hugs the ink. */
function trimCanvas(src: HTMLCanvasElement) {
  const ctx = src.getContext("2d")!;
  const { width, height } = src;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 10) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < 0) return null;
  const pad = 6;
  const out = document.createElement("canvas");
  out.width = maxX - minX + pad * 2;
  out.height = maxY - minY + pad * 2;
  out.getContext("2d")!.drawImage(src, minX - pad, minY - pad, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

const toPng = (c: HTMLCanvasElement) => new Promise<Blob>((res) => c.toBlob((b) => res(b!), "image/png"));

export type SignatureImage = { blob: Blob; url: string; width: number; height: number };

export function SignatureModal({
  title,
  defaultText,
  onDone,
  onClose,
}: {
  title: string;
  defaultText: string;
  onDone: (sig: SignatureImage) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"type" | "draw" | "upload">("type");
  const [text, setText] = useState(defaultText);
  const [font, setFont] = useState(0);
  const [ink, setInk] = useState(INK[0]);
  const [error, setError] = useState<string | null>(null);
  const pad = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  useEffect(() => {
    const c = pad.current;
    if (!c || tab !== "draw") return;
    c.width = c.offsetWidth * 2;
    c.height = c.offsetHeight * 2;
    const ctx = c.getContext("2d")!;
    ctx.scale(2, 2);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.6;
    hasInk.current = false;
  }, [tab]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  async function finish(canvas: HTMLCanvasElement) {
    const trimmed = trimCanvas(canvas);
    if (!trimmed) return setError("Your signature is empty.");
    const blob = await toPng(trimmed);
    onDone({ blob, url: URL.createObjectURL(blob), width: trimmed.width, height: trimmed.height });
  }

  async function apply() {
    setError(null);
    if (tab === "draw") {
      if (!pad.current || !hasInk.current) return setError("Draw your signature in the box.");
      return finish(pad.current);
    }
    if (tab === "type") {
      if (!text.trim()) return setError("Type your name.");
      const family = getComputedStyle(document.querySelector(`.${FONTS[font].className}`) ?? document.body).fontFamily;
      await document.fonts.load(`96px ${family}`);
      const c = document.createElement("canvas");
      const ctx = c.getContext("2d")!;
      ctx.font = `96px ${family}`;
      c.width = Math.ceil(ctx.measureText(text).width) + 40;
      c.height = 160;
      ctx.font = `96px ${family}`;
      ctx.fillStyle = ink;
      ctx.textBaseline = "middle";
      ctx.fillText(text, 20, 80);
      return finish(c);
    }
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    if (!/image\/(png|jpe?g)/.test(file.type)) return setError("Use a PNG or JPG image.");
    const bmp = await createImageBitmap(file);
    const c = document.createElement("canvas");
    c.width = bmp.width;
    c.height = bmp.height;
    c.getContext("2d")!.drawImage(bmp, 0, 0);
    const blob = await toPng(c);
    onDone({ blob, url: URL.createObjectURL(blob), width: bmp.width, height: bmp.height });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Close"><Icon name="x" size={22} /></button>
        </div>
        <div className="flex gap-1 border-b border-line px-4">
          {(["type", "draw", "upload"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`border-b-2 px-4 py-3 text-sm font-semibold capitalize ${tab === t ? "border-brand text-brand" : "border-transparent text-muted"}`}>
              {t}
            </button>
          ))}
        </div>
        <div className="p-6">
          {tab === "type" && (
            <>
              <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Your name" autoFocus />
              <div className="mt-4 grid gap-2">
                {FONTS.map((f, i) => (
                  <button key={i} onClick={() => setFont(i)} className={`${f.className} rounded-lg border px-4 py-2 text-left text-3xl ${font === i ? "border-brand bg-brand/5" : "border-line"}`} style={{ color: ink }}>
                    {text || "Your name"}
                  </button>
                ))}
              </div>
            </>
          )}
          {tab === "draw" && (
            <div>
              <canvas
                ref={pad}
                className="h-48 w-full touch-none rounded-lg border-2 border-dashed border-line bg-bg"
                onPointerDown={(e) => {
                  drawing.current = true;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  const ctx = e.currentTarget.getContext("2d")!;
                  ctx.strokeStyle = ink;
                  ctx.beginPath();
                  ctx.moveTo(...pos(e));
                }}
                onPointerMove={(e) => {
                  if (!drawing.current) return;
                  const ctx = e.currentTarget.getContext("2d")!;
                  ctx.lineTo(...pos(e));
                  ctx.stroke();
                  hasInk.current = true;
                }}
                onPointerUp={() => (drawing.current = false)}
              />
              <button
                className="mt-2 text-sm text-brand underline"
                onClick={() => {
                  const c = pad.current;
                  if (!c) return;
                  c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
                  hasInk.current = false;
                }}
              >
                Clear
              </button>
            </div>
          )}
          {tab === "upload" && (
            <label className="flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line text-muted hover:border-brand">
              <Icon name="upload" size={32} />
              Upload an image of your signature (PNG or JPG)
              <input type="file" accept="image/png,image/jpeg" hidden onChange={(e) => upload(e.target.files?.[0])} />
            </label>
          )}
          {tab !== "upload" && (
            <div className="mt-4 flex items-center gap-2">
              <span className="text-sm text-muted">Color</span>
              {INK.map((c) => (
                <button key={c} onClick={() => setInk(c)} aria-label={c} className={`h-6 w-6 rounded-full ${ink === c ? "ring-2 ring-brand ring-offset-2" : ""}`} style={{ background: c }} />
              ))}
            </div>
          )}
          {error && <p className="mt-3 text-sm text-brand">{error}</p>}
        </div>
        {tab !== "upload" && (
          <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={apply}>Apply</button>
          </div>
        )}
      </div>
    </div>
  );
}
