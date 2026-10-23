"use client";

import { useActionState } from "react";
import { requestPasswordReset, type AuthState } from "@/app/actions/auth";
import { AuthCard, FormError } from "@/components/AuthForm";
import { Icon } from "@/components/Icon";
import { useT } from "@/i18n/client";
import { Link } from "@/i18n/Link";

export function ForgotForm() {
  const t = useT();
  const [state, action, pending] = useActionState<AuthState, FormData>(requestPasswordReset, {});
  if (state.ok) {
    return (
      <AuthCard title={t("Check your email")}>
        <p className="mt-4 flex items-start gap-2 text-sm text-muted">
          <Icon name="mail-check" size={20} className="shrink-0 text-[#6aa84f]" />
          {t("If an account exists for {email}, we sent it a link to reset the password. The link expires in one hour.", { email: state.values?.email ?? "" })}
        </p>
        <Link href="/login" className="btn-secondary mt-6 w-full">{t("Back to login")}</Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={t("Forgot your password?")} subtitle={t("Enter your email and we'll send you a link to choose a new one.")}>
      <FormError message={state.error} />
      <form action={action} className="mt-6 space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block font-semibold">{t("Email")}</span>
          <input className="input" name="email" type="email" autoComplete="email" defaultValue={state.values?.email} required />
        </label>
        <button className="btn-primary w-full" disabled={pending}>{pending ? t("Please wait…") : t("Send reset link")}</button>
      </form>
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="font-semibold text-brand">{t("Back to login")}</Link>
      </p>
    </AuthCard>
  );
}
