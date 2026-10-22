"use client";

import { useState } from "react";
import { Icon } from "../../Icon";
import { SignWorkspace } from "../SignWorkspace";
import { ErrorBanner, type EditorProps } from "../ToolRunner";

function ModeSwitch({ mode, setMode }: { mode: "me" | "others"; setMode: (m: "me" | "others") => void }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold">Who will sign this document?</p>
      <div className="grid grid-cols-2 gap-2">
        {([["me", "user", "Only me"], ["others", "users", "Several people"]] as const).map(([id, icon, label]) => (
          <button
            key={id}
            onClick={() => setMode(id)}
            className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-3 text-sm font-medium ${mode === id ? "border-brand bg-brand/5 text-brand" : "border-line"}`}
          >
            <Icon name={icon} size={22} /> {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function RequestForm({ file, onBack }: { file: File; onBack: () => void }) {
  const [signer, setSigner] = useState("");
  const [message, setMessage] = useState("Please sign this document.");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!signer.trim()) return setError("Enter the signer's name.");
    setBusy(true);
    setError(undefined);
    const body = new FormData();
    body.append("file", file);
    body.append("signerName", signer.trim());
    body.append("message", message.trim());
    const res = await fetch("/api/sign-requests", { method: "POST", body });
    const data = (await res.json()) as { id?: string; error?: string };
    setBusy(false);
    if (!res.ok || !data.id) return setError(data.error ?? "Could not create the request.");
    setLink(`${window.location.origin}/sign/${data.id}`);
  }

  return (
    <section className="flex flex-1 flex-col items-center px-4 pt-12 pb-20">
      <h1 className="text-3xl font-bold">Request signatures</h1>
      <p className="mt-2 max-w-xl text-center text-muted">
        Create a signing link for <strong>{file.name}</strong>. Share it with the signer; when they sign, the same link
        lets you download the signed PDF.
      </p>
      <ErrorBanner message={error} />
      {link ? (
        <div className="mt-8 w-full max-w-xl rounded-2xl border border-line bg-white p-6 text-center shadow-sm">
          <Icon name="check" size={40} className="mx-auto text-[#6aa84f]" />
          <p className="mt-2 font-semibold">Signing link created</p>
          <div className="mt-4 flex gap-2">
            <input className="input font-mono text-sm" readOnly value={link} onFocus={(e) => e.target.select()} />
            <button
              className="btn-primary !px-4"
              onClick={async () => {
                await navigator.clipboard.writeText(link);
                setCopied(true);
              }}
            >
              <Icon name={copied ? "check" : "copy"} size={18} /> {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-3 text-xs text-muted">Anyone with this link can view and sign the document. Links expire after 30 days.</p>
          <a href={link} className="mt-4 inline-block text-sm font-medium text-brand underline">Open the signing page</a>
        </div>
      ) : (
        <form onSubmit={create} className="mt-8 w-full max-w-xl space-y-4 rounded-2xl border border-line bg-white p-6 shadow-sm">
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">Signer&apos;s name</span>
            <input className="input" value={signer} onChange={(e) => setSigner(e.target.value)} autoFocus />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">Message to the signer</span>
            <textarea className="input min-h-24" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} />
          </label>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={onBack}>Back</button>
            <button className="btn-primary flex-1" disabled={busy}>{busy ? "Creating…" : "Create signing link"}</button>
          </div>
        </form>
      )}
    </section>
  );
}

export default function SignEditor({ tool, items, submit, error, setError }: EditorProps) {
  const [mode, setMode] = useState<"me" | "others">("me");
  const file = items[0].file;
  if (mode === "others") return <RequestForm file={file} onBack={() => setMode("me")} />;
  return (
    <SignWorkspace
      file={file}
      title={tool.name}
      action={tool.action}
      error={error}
      setError={setError}
      sidebarTop={<ModeSwitch mode={mode} setMode={setMode} />}
      onSubmit={(overlays, extras) => submit([file], { overlays }, extras)}
    />
  );
}
