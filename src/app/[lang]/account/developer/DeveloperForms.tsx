"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { createKey, createWebhook, deleteWebhook, revokeKey, type HookState, type KeyState } from "@/app/actions/developer";
import { Icon } from "@/components/Icon";
import { useLang, useT } from "@/i18n/client";
import { LOCALE_TAGS } from "@/i18n/config";

function Secret({ label, value }: { label: string; value: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-lg border border-[#6aa84f]/40 bg-[#6aa84f]/10 p-4">
      <p className="text-sm font-semibold">{label}</p>
      <div className="mt-2 flex gap-2">
        <code className="input flex-1 overflow-x-auto font-mono text-xs whitespace-nowrap">{value}</code>
        <button
          type="button"
          className="btn-secondary !px-3"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
          }}
        >
          <Icon name={copied ? "check" : "copy"} size={16} /> {copied ? t("Copied") : t("Copy")}
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">{t("Copy it now: it won't be shown again.")}</p>
    </div>
  );
}

export function ApiKeys({ keys }: { keys: { id: number; name: string; prefix: string; created_at: number; last_used_at: number | null }[] }) {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, action, creating] = useActionState<KeyState, FormData>(createKey, {});
  useEffect(() => {
    if (state.key) router.refresh();
  }, [state.key, router]);
  const date = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString(LOCALE_TAGS[lang]) : t("never"));
  return (
    <div className="space-y-4">
      {state.key && <Secret label={t("Your new API key")} value={state.key} />}
      {keys.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Icon name="key" size={18} className="text-muted" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{k.name}</p>
                <p className="font-mono text-xs text-muted">{k.prefix}…</p>
              </div>
              <p className="text-xs text-muted">{t("Created {date} · last used {used}", { date: date(k.created_at), used: date(k.last_used_at) })}</p>
              <button
                className="btn-secondary !px-3 !py-1.5 text-xs !text-brand"
                disabled={pending}
                onClick={() => {
                  if (!confirm(t("Revoke the key “{name}”? Apps using it will stop working.", { name: k.name }))) return;
                  start(async () => {
                    await revokeKey(k.id);
                    router.refresh();
                  });
                }}
              >
                {t("Revoke")}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form action={action} className="flex flex-wrap gap-2">
        <input className="input max-w-72" name="name" placeholder={t("Key name, e.g. Zapier")} maxLength={60} />
        <button className="btn-primary" disabled={creating}>
          <Icon name="plus" size={18} /> {t("Create API key")}
        </button>
      </form>
      {state.error && <p className="text-sm text-brand">{state.error}</p>}
    </div>
  );
}

export function Webhooks({
  hooks,
  events,
}: {
  hooks: { id: number; url: string; events: string; last_status: number | null; last_at: number | null }[];
  events: string[];
}) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, action, creating] = useActionState<HookState, FormData>(createWebhook, {});
  useEffect(() => {
    if (state.secret) router.refresh();
  }, [state.secret, router]);
  return (
    <div className="space-y-4">
      {state.secret && <Secret label={t("Signing secret of the new webhook")} value={state.secret} />}
      {hooks.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {hooks.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm">{h.url}</p>
                <p className="text-xs text-muted">{h.events.split(",").join(", ")}</p>
              </div>
              {h.last_status !== null && (
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${h.last_status >= 200 && h.last_status < 300 ? "bg-[#6aa84f]/15 text-[#4a8a32]" : "bg-brand/10 text-brand"}`}>
                  {h.last_status || t("failed")}
                </span>
              )}
              <button
                className="rounded-lg p-2 text-muted hover:bg-bg hover:text-brand"
                title={t("Delete")}
                disabled={pending}
                onClick={() => start(async () => {
                  await deleteWebhook(h.id);
                  router.refresh();
                })}
              >
                <Icon name="trash" size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form action={action} className="space-y-3 rounded-lg border border-line p-4">
        <input className="input" name="url" type="url" placeholder="https://hooks.zapier.com/…" required />
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {events.map((e) => (
            <label key={e} className="flex items-center gap-2 font-mono text-xs">
              <input type="checkbox" name="events" value={e} defaultChecked className="h-4 w-4 accent-[var(--brand)]" /> {e}
            </label>
          ))}
        </div>
        <button className="btn-secondary" disabled={creating}>
          <Icon name="plus" size={18} /> {t("Add webhook")}
        </button>
        {state.error && <p className="text-sm text-brand">{state.error}</p>}
      </form>
    </div>
  );
}
