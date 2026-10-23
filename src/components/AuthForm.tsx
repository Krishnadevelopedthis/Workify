"use client";

import { useActionState } from "react";
import { login, signup, type AuthState } from "@/app/actions/auth";
import { useT } from "@/i18n/client";
import { Link } from "@/i18n/Link";
import { rich } from "@/i18n/rich";
import { Icon } from "./Icon";
import { Logo } from "./Logo";

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-1 items-center justify-center px-4 py-14">
      <div className="w-full max-w-md rounded-2xl border border-line bg-white p-8 shadow-sm">
        <div className="flex justify-center"><Logo /></div>
        <h1 className="mt-6 text-center text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-center text-sm text-muted">{subtitle}</p>}
        {children}
      </div>
    </section>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-5 flex items-start gap-2 rounded-lg bg-brand/5 px-3 py-2 text-sm text-brand">
      <Icon name="alert-triangle" size={18} className="mt-0.5 shrink-0" /> {message}
    </p>
  );
}

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next: string }) {
  const t = useT();
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "login" ? login : signup, {});
  const isSignup = mode === "signup";
  const nextQuery = next !== "/" ? `?next=${encodeURIComponent(next)}` : "";

  return (
    <AuthCard
      title={isSignup ? t("Create new account") : t("Login to your account")}
      subtitle={isSignup ? t("Save workflows, request signatures and use the API. It's free.") : t("Welcome back to Workify.")}
    >
      <FormError message={state.error} />
      <form action={action} className="mt-6 space-y-4">
        <input type="hidden" name="next" value={next} />
        {isSignup && (
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">{t("Name")}</span>
            <input className="input" name="name" autoComplete="name" defaultValue={state.values?.name} required />
          </label>
        )}
        <label className="block text-sm">
          <span className="mb-1 block font-semibold">{t("Email")}</span>
          <input className="input" name="email" type="email" autoComplete="email" defaultValue={state.values?.email} required />
        </label>
        <label className="block text-sm">
          <span className="mb-1 flex items-center justify-between font-semibold">
            {t("Password")}
            {!isSignup && (
              <Link href="/forgot-password" className="text-xs font-medium text-brand">{t("Forgot password?")}</Link>
            )}
          </span>
          <input
            className="input"
            name="password"
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            minLength={isSignup ? 8 : undefined}
            required
          />
          {isSignup && <span className="mt-1 block text-xs text-muted">{t("At least 8 characters.")}</span>}
        </label>
        <button className="btn-primary w-full" disabled={pending}>
          {pending ? t("Please wait…") : isSignup ? t("Sign up") : t("Log in")}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        {isSignup ? t("Already a member?") : t("Don't have an account?")}{" "}
        <Link href={`/${isSignup ? "login" : "signup"}${nextQuery}`} className="font-semibold text-brand">
          {isSignup ? t("Log in") : t("Create an account")}
        </Link>
      </p>
      {isSignup && (
        <p className="mt-4 text-center text-xs text-muted">
          {rich(t("By creating an account, you agree to our <terms>Terms</terms> and <privacy>Privacy Policy</privacy>."), {
            terms: (c) => <Link href="/terms" className="underline">{c}</Link>,
            privacy: (c) => <Link href="/privacy" className="underline">{c}</Link>,
          })}
        </p>
      )}
    </AuthCard>
  );
}
