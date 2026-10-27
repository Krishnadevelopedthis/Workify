"use client";

import { useState, useTransition } from "react";
import { testSmtp } from "@/app/actions/admin";
import { useT } from "@/i18n/client";
import { IconInput } from "@/components/ui/IconInput";

export function SmtpTest({ defaultTo }: { defaultTo: string }) {
  const t = useT();
  const [to, setTo] = useState(defaultTo);
  const [result, setResult] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <IconInput icon="mail" wrapperClassName="max-w-64" className="!py-1.5 text-sm" type="email" value={to} onChange={(e) => setTo(e.target.value)} />
      <button
        className="btn-secondary !py-1.5 text-sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await testSmtp(to);
            setResult(r.error ?? t("Test email sent. Check the inbox (and the Emails page)."));
          })
        }
      >
        {t("Send test email")}
      </button>
      {result && <p className="w-full text-xs text-muted">{result}</p>}
    </div>
  );
}
