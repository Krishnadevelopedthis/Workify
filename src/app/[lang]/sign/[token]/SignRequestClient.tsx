"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { SignWorkspace } from "@/components/tool/SignWorkspace";
import { useLang, useT } from "@/i18n/client";

export function SignRequestClient({
  token,
  fileName,
  signerName,
  senderName,
  message,
}: {
  token: string;
  fileName: string;
  signerName: string;
  senderName: string;
  message: string;
}) {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sign/${token}/file`, { headers: { "x-wf-lang": lang } })
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        const blob = await r.blob();
        if (!cancelled) setFile(new File([blob], fileName, { type: "application/pdf" }));
      })
      .catch((e: Error) => !cancelled && setError(e.message || t("The document could not be loaded.")));
    return () => {
      cancelled = true;
    };
  }, [token, fileName, lang, t]);

  async function post(body: FormData) {
    setBusy(true);
    setError(undefined);
    const res = await fetch(`/api/sign/${token}`, { method: "POST", body, headers: { "x-wf-lang": lang } });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) return setError(data.error ?? t("Signing failed. Please try again."));
    router.refresh(); // the server page now shows the new state
  }

  async function sign(overlays: unknown[], extras: Record<string, Blob>) {
    const body = new FormData();
    body.append("action", "sign");
    body.append("overlays", JSON.stringify(overlays));
    Object.entries(extras).forEach(([k, v]) => body.append(`extra:${k}`, v, `${k}.png`));
    await post(body);
  }

  async function decline() {
    const body = new FormData();
    body.append("action", "decline");
    body.append("reason", reason);
    await post(body);
  }

  if (!file) {
    return <p className="flex flex-1 items-center justify-center p-20 text-muted">{error ?? t("Loading document…")}</p>;
  }

  return (
    <SignWorkspace
      file={file}
      title={t("Sign document")}
      action={busy ? t("Signing…") : t("Sign and send")}
      error={error}
      setError={setError}
      defaultName={signerName}
      sidebarTop={
        <div className="space-y-3">
          <div className="rounded-lg bg-bg p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold">
              <Icon name="mail" size={18} className="text-brand" /> {t("{sender} asked you to sign", { sender: senderName })}
            </p>
            {message && <p className="mt-2 whitespace-pre-wrap text-muted">“{message}”</p>}
          </div>
          {declining ? (
            <div className="space-y-2 rounded-lg border border-line p-3">
              <textarea
                className="input min-h-20 text-sm"
                placeholder={t("Why are you declining? (optional)")}
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
              />
              <div className="flex gap-2">
                <button className="btn-secondary flex-1 !py-1.5 text-sm" onClick={() => setDeclining(false)}>{t("Back")}</button>
                <button className="btn-primary flex-1 !py-1.5 text-sm" disabled={busy} onClick={decline}>{t("Decline")}</button>
              </div>
            </div>
          ) : (
            <button className="text-sm font-medium text-muted underline" onClick={() => setDeclining(true)}>
              {t("Decline to sign")}
            </button>
          )}
        </div>
      }
      onSubmit={sign}
    />
  );
}
