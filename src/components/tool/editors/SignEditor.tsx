"use client";

import { useEffect, useState } from "react";
import { listTemplates, saveTemplate, type SignTemplate } from "@/app/actions/signatures";
import { useLang, useT } from "@/i18n/client";
import { Link } from "@/i18n/Link";
import { Icon } from "../../Icon";
import { SignWorkspace } from "../SignWorkspace";
import { ErrorBanner, type EditorProps } from "../ToolRunner";
import { IconInput, IconSelect, IconTextarea } from "@/components/ui/IconInput";

function ModeSwitch({ mode, setMode }: { mode: "me" | "others"; setMode: (m: "me" | "others") => void }) {
  const t = useT();
  return (
    <div>
      <p className="mb-2 text-sm font-semibold">{t("Who will sign this document?")}</p>
      <div className="grid grid-cols-2 gap-2">
        {([["me", "user", "Only me"], ["others", "users", "Several people"]] as const).map(([id, icon, label]) => (
          <button
            key={id}
            onClick={() => setMode(id)}
            className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-3 text-sm font-medium ${mode === id ? "border-brand bg-brand/5 text-brand" : "border-line"}`}
          >
            <Icon name={icon} size={22} /> {t(label)}
          </button>
        ))}
      </div>
    </div>
  );
}

type Row = { key: number; name: string; email: string };
type Session = { name: string; email: string; verified?: boolean } | null;
type Created = {
  manageLink: string;
  accountLink: string | null;
  signers: { name: string; email: string | null; link: string }[];
};

let rowKey = 0;
const newRow = (name = "", email = ""): Row => ({ key: ++rowKey, name, email });

function CopyButton({ text }: { text: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn-secondary !px-3 !py-1.5 text-xs"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
      }}
    >
      <Icon name={copied ? "check" : "copy"} size={14} /> {copied ? t("Copied") : t("Copy")}
    </button>
  );
}

function RequestForm({ file, onBack }: { file: File; onBack: () => void }) {
  const t = useT();
  const lang = useLang();
  const [session, setSession] = useState<Session | undefined>(undefined);
  const [templates, setTemplates] = useState<SignTemplate[]>([]);
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [ordered, setOrdered] = useState(false);
  const [message, setMessage] = useState(t("Please sign this document."));
  const [reminderDays, setReminderDays] = useState(0);
  const [senderName, setSenderName] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [created, setCreated] = useState<Created | null>(null);

  useEffect(() => {
    fetch("/api/session", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ user: Session }>)
      .then((d) => {
        setSession(d.user);
        if (d.user) listTemplates().then(setTemplates);
      })
      .catch(() => setSession(null));
  }, []);

  const canEmail = Boolean(session?.verified);
  const update = (key: number, patch: Partial<Row>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (i: number, d: number) =>
    setRows((all) => {
      const next = [...all];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });
  const signers = () => rows.map((r) => ({ name: r.name.trim(), email: canEmail ? r.email.trim() || null : null }));

  function applyTemplate(id: string) {
    const tpl = templates.find((x) => String(x.id) === id);
    if (!tpl) return;
    setRows(tpl.data.signers.map((s) => newRow(s.name, s.email ?? "")));
    setOrdered(tpl.data.ordered);
    setMessage(tpl.data.message);
    setReminderDays(tpl.data.reminderDays);
  }

  async function storeTemplate() {
    setNote(null);
    const r = await saveTemplate(templateName, { signers: signers(), message, ordered, reminderDays });
    if (r.error) return setNote(r.error);
    setNote(t("Template saved."));
    setTemplateName("");
    setTemplates(await listTemplates());
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (rows.some((r) => !r.name.trim())) return setError(t("Enter a name for every signer."));
    setBusy(true);
    setError(undefined);
    const body = new FormData();
    body.append("file", file);
    body.append("signers", JSON.stringify(signers()));
    body.append("message", message.trim());
    body.append("ordered", String(ordered));
    body.append("reminderDays", String(reminderDays));
    body.append("senderName", senderName.trim());
    const res = await fetch("/api/sign-requests", { method: "POST", body, headers: { "x-wf-lang": lang } });
    const data = (await res.json().catch(() => ({}))) as Created & { error?: string };
    setBusy(false);
    if (!res.ok) return setError(data.error ?? t("Could not create the request."));
    setCreated(data);
  }

  if (created) {
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    return (
      <section className="flex flex-1 flex-col items-center px-4 pt-12 pb-20">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#6aa84f] text-white"><Icon name="check" size={32} /></span>
        <h1 className="mt-4 text-3xl font-bold">{t("Signature request sent")}</h1>
        <p className="mt-2 max-w-xl text-center text-muted">
          {created.signers.some((s) => s.email)
            ? t("Signers with an email address have been invited. Share the other links yourself.")
            : t("Share each signer's personal link with them.")}
        </p>
        <div className="mt-8 w-full max-w-2xl space-y-3 rounded-2xl border border-line bg-white p-6 shadow-sm">
          {created.signers.map((s, i) => (
            <div key={i} className="flex flex-wrap items-center gap-3 border-b border-line pb-3 last:border-0 last:pb-0">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-bg text-xs font-bold">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{s.name}</p>
                <p className="truncate text-xs text-muted">{s.email ? t("Invited by email: {email}", { email: s.email }) : `${origin}${s.link}`}</p>
              </div>
              <CopyButton text={`${origin}${s.link}`} />
            </div>
          ))}
        </div>
        <div className="mt-6 w-full max-w-2xl rounded-2xl border border-[#f1b800]/40 bg-[#f1b800]/10 p-5 text-sm">
          {created.accountLink ? (
            <p>
              {t("Follow the progress, send reminders and download the signed PDF from your account.")}{" "}
              <Link href={created.accountLink} className="font-semibold text-brand underline">{t("Open request")}</Link>
            </p>
          ) : (
            <>
              <p className="font-semibold">{t("Save this private link to follow the request and download the signed PDF:")}</p>
              <div className="mt-2 flex gap-2">
                <input className="input font-mono text-xs" readOnly value={`${origin}${created.manageLink}`} onFocus={(e) => e.target.select()} />
                <CopyButton text={`${origin}${created.manageLink}`} />
              </div>
              <p className="mt-2 text-xs text-muted">{t("It is shown only once. Create an account to keep all your requests in one place.")}</p>
            </>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-1 flex-col items-center px-4 pt-12 pb-20">
      <h1 className="text-3xl font-bold">{t("Request signatures")}</h1>
      <p className="mt-2 max-w-xl text-center text-muted">
        {t("Send {file} to one or more people. Each signer gets a personal link; when everyone has signed, the PDF gets an audit trail and a digital seal.", { file: file.name })}
      </p>
      <ErrorBanner message={error} />
      <form onSubmit={create} className="mt-8 w-full max-w-2xl space-y-5 rounded-2xl border border-line bg-white p-6 shadow-sm">
        {templates.length > 0 && (
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">{t("Use a template")}</span>
            <select className="input" defaultValue="" onChange={(e) => applyTemplate(e.target.value)}>
              <option value="" disabled>{t("Choose a template…")}</option>
              {templates.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
        )}

        <div>
          <p className="mb-2 text-sm font-semibold">{t("Signers")}</p>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={r.key} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg text-xs font-bold">{i + 1}</span>
                <IconInput icon="user" wrapperClassName="min-w-0 flex-1" placeholder={t("Name")} value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} maxLength={100} />
                <IconInput
                  icon="mail"
                  wrapperClassName="min-w-0 flex-1"
                  type="email"
                  placeholder={canEmail ? t("Email (optional)") : t("Email: log in to invite")}
                  value={r.email}
                  disabled={!canEmail}
                  onChange={(e) => update(r.key, { email: e.target.value })}
                />
                <div className="flex shrink-0">
                  <button type="button" className="rounded p-1.5 text-muted hover:text-ink disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t("Move up")}>
                    <Icon name="arrow-up" size={16} />
                  </button>
                  <button type="button" className="rounded p-1.5 text-muted hover:text-ink disabled:opacity-30" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label={t("Move down")}>
                    <Icon name="arrow-down" size={16} />
                  </button>
                  <button type="button" className="rounded p-1.5 text-muted hover:text-brand disabled:opacity-30" disabled={rows.length === 1} onClick={() => setRows(rows.filter((x) => x.key !== r.key))} aria-label={t("Remove")}>
                    <Icon name="x" size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {rows.length < 20 && (
            <button type="button" className="mt-2 text-sm font-semibold text-brand" onClick={() => setRows([...rows, newRow()])}>
              + {t("Add signer")}
            </button>
          )}
          {session !== undefined && !canEmail && (
            <p className="mt-2 text-xs text-muted">
              {session
                ? t("Confirm your email address to invite signers by email. Until then, share the links yourself.")
                : t("Log in with a verified email to invite signers by email. Without an account, you share the signing links yourself.")}
            </p>
          )}
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium">
          <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={ordered} onChange={(e) => setOrdered(e.target.checked)} />
          {t("Signers sign in the order listed")}
        </label>

        {session === null && (
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">{t("Your name")}</span>
            <IconInput icon="user" value={senderName} onChange={(e) => setSenderName(e.target.value)} maxLength={100} required />
          </label>
        )}

        <label className="block text-sm">
          <span className="mb-1 block font-semibold">{t("Message to the signers")}</span>
          <IconTextarea icon="message-2" className="min-h-24" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} />
        </label>

        {canEmail && (
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">{t("Automatic reminders")}</span>
            <IconSelect icon="clock" value={reminderDays} onChange={(e) => setReminderDays(Number(e.target.value))}>
              <option value={0}>{t("Off")}</option>
              {[1, 2, 3, 7].map((d) => <option key={d} value={d}>{t("Every {days} day(s)", { days: d })}</option>)}
            </IconSelect>
          </label>
        )}

        {session && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <IconInput icon="template" wrapperClassName="max-w-60" className="!py-1.5 text-sm" placeholder={t("Template name")} value={templateName} onChange={(e) => setTemplateName(e.target.value)} maxLength={80} />
            <button type="button" className="btn-secondary !py-1.5 text-sm" onClick={storeTemplate}>
              <Icon name="template" size={16} /> {t("Save as template")}
            </button>
            {note && <span className="text-xs text-muted">{note}</span>}
          </div>
        )}

        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={onBack}>{t("Back")}</button>
          <button className="btn-primary flex-1" disabled={busy}>
            <Icon name="send" size={18} /> {busy ? t("Sending…") : t("Send for signature")}
          </button>
        </div>
      </form>
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
