"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { SignWorkspace } from "@/components/tool/SignWorkspace";

export function SignRequestClient({
  id,
  fileName,
  signerName,
  message,
}: {
  id: string;
  fileName: string;
  signerName: string;
  message: string;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sign-requests/${id}/file`)
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        const blob = await r.blob();
        if (!cancelled) setFile(new File([blob], fileName, { type: "application/pdf" }));
      })
      .catch((e: Error) => !cancelled && setError(e.message || "The document could not be loaded."));
    return () => {
      cancelled = true;
    };
  }, [id, fileName]);

  async function sign(overlays: unknown[], extras: Record<string, Blob>) {
    setBusy(true);
    setError(undefined);
    const body = new FormData();
    body.append("overlays", JSON.stringify(overlays));
    Object.entries(extras).forEach(([k, v]) => body.append(`extra:${k}`, v, `${k}.png`));
    const res = await fetch(`/api/sign-requests/${id}/sign`, { method: "POST", body });
    const data = (await res.json()) as { error?: string };
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Signing failed.");
    router.refresh(); // the server page now shows the signed state
  }

  if (!file) {
    return (
      <p className="flex flex-1 items-center justify-center p-20 text-muted">
        {error ?? "Loading document…"}
      </p>
    );
  }

  return (
    <SignWorkspace
      file={file}
      title="Sign document"
      action={busy ? "Signing…" : "Sign and send"}
      error={error}
      setError={setError}
      sidebarTop={
        <div className="rounded-lg bg-bg p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold">
            <Icon name="mail" size={18} className="text-brand" /> Signature requested from {signerName}
          </p>
          {message && <p className="mt-2 text-muted">“{message}”</p>}
        </div>
      }
      onSubmit={sign}
    />
  );
}
