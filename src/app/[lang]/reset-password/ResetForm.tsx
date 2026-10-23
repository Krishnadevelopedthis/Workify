"use client";

import { useActionState } from "react";
import { resetPassword, type AuthState } from "@/app/actions/auth";
import { AuthCard, FormError } from "@/components/AuthForm";
import { useT } from "@/i18n/client";

export function ResetForm({ token }: { token: string }) {
  const t = useT();
  const [state, action, pending] = useActionState<AuthState, FormData>(resetPassword, {});
  return (
    <AuthCard title={t("Choose a new password")} subtitle={t("You'll be signed out on all other devices.")}>
      <FormError message={state.error} />
      <form action={action} className="mt-6 space-y-4">
        <input type="hidden" name="token" value={token} />
        <label className="block text-sm">
          <span className="mb-1 block font-semibold">{t("New password")}</span>
          <input className="input" name="password" type="password" autoComplete="new-password" minLength={8} required />
          <span className="mt-1 block text-xs text-muted">{t("At least 8 characters.")}</span>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-semibold">{t("Repeat password")}</span>
          <input className="input" name="repeat" type="password" autoComplete="new-password" minLength={8} required />
        </label>
        <button className="btn-primary w-full" disabled={pending}>{pending ? t("Please wait…") : t("Save new password")}</button>
      </form>
    </AuthCard>
  );
}
