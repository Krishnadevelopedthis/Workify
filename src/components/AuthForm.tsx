"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, signup, type AuthState } from "@/app/actions/auth";
import { Icon } from "./Icon";
import { Logo } from "./Logo";

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "login" ? login : signup, {});
  const isSignup = mode === "signup";

  return (
    <section className="flex flex-1 items-center justify-center px-4 py-14">
      <div className="w-full max-w-md rounded-2xl border border-line bg-white p-8 shadow-sm">
        <div className="flex justify-center"><Logo /></div>
        <h1 className="mt-6 text-center text-2xl font-bold">{isSignup ? "Create new account" : "Login to your account"}</h1>
        <p className="mt-1 text-center text-sm text-muted">
          {isSignup ? "Save workflows and signature requests. It's free." : "Welcome back to Workify."}
        </p>
        {state.error && (
          <p role="alert" className="mt-5 flex items-start gap-2 rounded-lg bg-brand/5 px-3 py-2 text-sm text-brand">
            <Icon name="alert-triangle" size={18} className="mt-0.5 shrink-0" /> {state.error}
          </p>
        )}
        <form action={action} className="mt-6 space-y-4">
          <input type="hidden" name="next" value={next} />
          {isSignup && (
            <label className="block text-sm">
              <span className="mb-1 block font-semibold">Name</span>
              <input className="input" name="name" autoComplete="name" defaultValue={state.values?.name} required />
            </label>
          )}
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">Email</span>
            <input className="input" name="email" type="email" autoComplete="email" defaultValue={state.values?.email} required />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">Password</span>
            <input
              className="input"
              name="password"
              type="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              minLength={isSignup ? 8 : undefined}
              required
            />
            {isSignup && <span className="mt-1 block text-xs text-muted">At least 8 characters.</span>}
          </label>
          <button className="btn-primary w-full" disabled={pending}>
            {pending ? "Please wait…" : isSignup ? "Sign up" : "Log in"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-muted">
          {isSignup ? "Already a member? " : "Don't have an account? "}
          <Link href={`/${isSignup ? "login" : "signup"}${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-brand">
            {isSignup ? "Log in" : "Create an account"}
          </Link>
        </p>
        {isSignup && (
          <p className="mt-4 text-center text-xs text-muted">
            By creating an account, you agree to our <Link href="/terms" className="underline">Terms</Link> and{" "}
            <Link href="/privacy" className="underline">Privacy Policy</Link>.
          </p>
        )}
      </div>
    </section>
  );
}
