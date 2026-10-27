"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import {
  changeEmail,
  changePassword,
  deleteAccount,
  resendVerification,
  updateProfile,
  type AuthState,
} from "@/app/actions/auth";
import { deleteWorkflow } from "@/app/actions/workflows";
import { Icon } from "@/components/Icon";
import { useT } from "@/i18n/client";
import { IconInput } from "@/components/ui/IconInput";

const Error = ({ message }: { message?: string }) => (message ? <p className="text-sm text-brand">{message}</p> : null);
const Ok = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-[#4a8a32]">{children}</p>;

export function VerifyBanner({ email }: { email: string }) {
  const t = useT();
  const [state, setState] = useState<AuthState>({});
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[#f1b800]/40 bg-[#f1b800]/10 px-4 py-3 sm:flex-row sm:items-center">
      <Icon name="mail" size={22} className="shrink-0 text-[#a07a00]" />
      <p className="flex-1 text-sm">
        {state.ok
          ? t("We sent a new confirmation link to {email}.", { email })
          : t("Please confirm your email address ({email}) to send signature invitations.", { email })}
        {state.error && <span className="block text-brand">{state.error}</span>}
      </p>
      {!state.ok && (
        <button className="btn-secondary !py-1.5 text-sm" disabled={pending} onClick={() => start(async () => setState(await resendVerification()))}>
          {t("Resend email")}
        </button>
      )}
    </div>
  );
}

export function NameForm({ name }: { name: string }) {
  const t = useT();
  const router = useRouter();
  const [state, action, pending] = useActionState<AuthState, FormData>(async (prev, form) => {
    const r = await updateProfile(prev, form);
    if (r.ok) router.refresh();
    return r;
  }, {});
  return (
    <form action={action} className="space-y-3">
      <IconInput icon="user" name="name" maxLength={100} defaultValue={name} autoComplete="name" required />
      <Error message={state.error} />
      {state.ok && <Ok>{t("Saved.")}</Ok>}
      <button className="btn-secondary" disabled={pending}>{pending ? t("Saving…") : t("Save")}</button>
    </form>
  );
}

export function EmailForm() {
  const t = useT();
  const [state, action, pending] = useActionState<AuthState, FormData>(changeEmail, {});
  if (state.ok) return <Ok>{t("We sent a confirmation link to your new address. Your email changes when you click it.")}</Ok>;
  return (
    <form action={action} className="space-y-3">
      <IconInput icon="mail" name="email" type="email" maxLength={254} placeholder={t("New email address")} autoComplete="email" required />
      <IconInput icon="lock" name="password" type="password" placeholder={t("Current password")} autoComplete="current-password" required />
      <Error message={state.error} />
      <button className="btn-secondary" disabled={pending}>{pending ? t("Please wait…") : t("Change email")}</button>
    </form>
  );
}

export function PasswordForm() {
  const t = useT();
  const [state, action, pending] = useActionState<AuthState, FormData>(changePassword, {});
  return (
    <form action={action} className="space-y-3">
      <IconInput icon="lock" name="current" type="password" placeholder={t("Current password")} autoComplete="current-password" required />
      <IconInput icon="lock" name="next" type="password" placeholder={t("New password (8+ characters)")} autoComplete="new-password" minLength={8} maxLength={200} required />
      <Error message={state.error} />
      {state.ok && <Ok>{t("Password changed. Other devices were signed out.")}</Ok>}
      <button className="btn-secondary" disabled={pending}>{pending ? t("Saving…") : t("Change password")}</button>
    </form>
  );
}

export function WorkflowList({ workflows }: { workflows: { id: number; name: string; steps: string[] }[] }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!workflows.length) return <p className="text-sm text-muted">{t("You haven't saved any workflows yet.")}</p>;
  return (
    <ul className="divide-y divide-line">
      {workflows.map((w) => (
        <li key={w.id} className="flex items-center gap-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{w.name}</p>
            <p className="text-sm text-muted">{w.steps.map((s) => t(s)).join(" → ")}</p>
          </div>
          <button
            className="rounded-lg p-2 text-muted hover:bg-bg hover:text-brand"
            title={t("Delete")}
            disabled={pending}
            onClick={() => {
              if (!confirm(t("Delete the workflow “{name}”?", { name: w.name }))) return;
              start(async () => {
                await deleteWorkflow(w.id);
                router.refresh();
              });
            }}
          >
            <Icon name="trash" size={18} />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function DeleteAccount() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<AuthState, FormData>(deleteAccount, {});
  if (!open) {
    return (
      <button className="btn-secondary !border-brand/40 !text-brand" onClick={() => setOpen(true)}>
        <Icon name="user-x" size={18} /> {t("Delete my account")}
      </button>
    );
  }
  return (
    <form action={action} className="max-w-sm space-y-3">
      <IconInput icon="lock" name="password" type="password" placeholder={t("Current password")} autoComplete="current-password" required />
      <label className="block text-sm">
        <span className="mb-1 block">{t("Type DELETE to confirm")}</span>
        <IconInput icon="alert-triangle" name="confirm" autoComplete="off" required />
      </label>
      <Error message={state.error} />
      <div className="flex gap-2">
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>{t("Cancel")}</button>
        <button className="btn-primary" disabled={pending}>{pending ? t("Deleting…") : t("Delete permanently")}</button>
      </div>
    </form>
  );
}
