"use client";

import { useState, useTransition } from "react";
import { replyToMessage } from "@/app/actions/admin";
import { Icon } from "@/components/Icon";
import { useT } from "@/i18n/client";
import { IconTextarea } from "@/components/ui/IconInput";

/** Sends an email reply in the sender's language layout and marks the message handled. */
export function ReplyForm({ id }: { id: number }) {
  const t = useT();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mt-4 space-y-2 border-t border-line pt-4">
      <IconTextarea icon="message-2" className="min-h-24 text-sm" placeholder={t("Write a reply…")} value={text} onChange={(e) => setText(e.target.value)} />
      {error && <p className="text-xs text-brand">{error}</p>}
      <button
        className="btn-primary !py-1.5 text-sm"
        disabled={pending || !text.trim()}
        onClick={() =>
          start(async () => {
            const r = await replyToMessage(id, text);
            if (r.error) setError(r.error);
          })
        }
      >
        <Icon name="send" size={16} /> {t("Send reply")}
      </button>
    </div>
  );
}
