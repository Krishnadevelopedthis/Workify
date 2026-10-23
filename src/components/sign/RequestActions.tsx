"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelRequest, remindSigners } from "@/app/actions/signatures";
import { Icon } from "@/components/Icon";
import { useT } from "@/i18n/client";

type Access = { kind: "account"; id: string } | { kind: "manage"; token: string };

/** Remind / cancel buttons for the owner, or a "copy link" button for one signer. */
export function RequestActions({ access, copyLink }: { access: Access; copyLink?: string }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (copyLink) {
    return (
      <button
        className="btn-secondary !px-3 !py-1.5 text-xs"
        onClick={async () => {
          await navigator.clipboard.writeText(`${window.location.origin}${copyLink}`);
          setCopied(true);
        }}
      >
        <Icon name={copied ? "check" : "copy"} size={14} /> {copied ? t("Copied") : t("Copy link")}
      </button>
    );
  }

  async function act(action: "remind" | "cancel") {
    if (action === "cancel" && !confirm(t("Cancel this signature request? Signers will be told they don't need to sign."))) return;
    start(async () => {
      let result: { error?: string; reminded?: number };
      if (access.kind === "account") {
        result = action === "remind" ? await remindSigners(access.id) : await cancelRequest(access.id);
      } else {
        const res = await fetch(`/api/sign-manage/${access.token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        result = await res.json();
      }
      if (result.error) setNote(result.error);
      else if (action === "remind") setNote(t("Reminders sent: {n}", { n: result.reminded ?? 0 }));
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button className="btn-secondary !py-2" disabled={pending} onClick={() => act("remind")}>
          <Icon name="bell" size={18} /> {t("Send reminder")}
        </button>
        <button className="btn-secondary !py-2 !text-brand" disabled={pending} onClick={() => act("cancel")}>
          <Icon name="x" size={18} /> {t("Cancel request")}
        </button>
      </div>
      {note && <p className="text-xs text-muted">{note}</p>}
    </div>
  );
}
