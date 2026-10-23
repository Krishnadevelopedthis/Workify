"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useT } from "@/i18n/client";

/** Runs a (bound) admin server action, with an optional confirmation. */
export function ActionButton({
  action,
  confirmText,
  children,
  danger = false,
}: {
  action: () => Promise<{ error?: string } | object | void>;
  confirmText?: string;
  children: ReactNode;
  danger?: boolean;
}) {
  const t = useT();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-start">
      <button
        className={`btn-secondary !px-3 !py-1 text-xs ${danger ? "!text-brand" : ""}`}
        disabled={pending}
        onClick={() => {
          if (confirmText && !confirm(t(confirmText))) return;
          setError(null);
          start(async () => {
            const r = await action();
            if (r && "error" in r && typeof r.error === "string") setError(r.error);
          });
        }}
      >
        {children}
      </button>
      {error && <span className="mt-1 text-xs text-brand">{error}</span>}
    </span>
  );
}
