"use client";

import { useActionState } from "react";
import { changePassword, type PasswordState } from "@/app/actions/auth";

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePassword, {});
  return (
    <form action={action} className="space-y-3">
      <input className="input" name="current" type="password" placeholder="Current password" autoComplete="current-password" required />
      <input className="input" name="next" type="password" placeholder="New password (8+ characters)" autoComplete="new-password" minLength={8} required />
      {state.error && <p className="text-sm text-brand">{state.error}</p>}
      {state.ok && <p className="text-sm text-[#4a8a32]">Password changed. Other devices were signed out.</p>}
      <button className="btn-secondary" disabled={pending}>{pending ? "Saving…" : "Change password"}</button>
    </form>
  );
}
