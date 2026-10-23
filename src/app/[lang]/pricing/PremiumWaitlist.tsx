"use client";

import { useActionState } from "react";
import { joinWaitlist, type WaitlistState } from "@/app/actions/premium";
import { Icon } from "@/components/Icon";
import { useT } from "@/i18n/client";

/** "Tell me when Premium launches" email form. */
export function PremiumWaitlist() {
  const t = useT();
  const [state, action, pending] = useActionState<WaitlistState, FormData>(joinWaitlist, {});
  if (state.ok) {
    return (
      <p className="mt-8 flex items-center gap-2 rounded-lg bg-[#6aa84f]/10 px-4 py-3 text-sm font-semibold text-[#4a8a32]">
        <Icon name="check" size={18} /> {t("You're on the list. We'll email you when Premium launches.")}
      </p>
    );
  }
  return (
    <form action={action} className="mt-8 space-y-2">
      <input className="input" name="email" type="email" placeholder={t("Your email")} required autoComplete="email" />
      {state.error && <p className="text-sm text-brand">{state.error}</p>}
      <button className="btn-secondary w-full" disabled={pending}>
        <Icon name="bell" size={18} /> {pending ? t("Please wait…") : t("Notify me")}
      </button>
    </form>
  );
}
