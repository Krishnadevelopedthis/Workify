"use client";

import { useActionState } from "react";
import { sendMessage, type ContactState } from "@/app/actions/contact";
import { Icon } from "@/components/Icon";
import { useT } from "@/i18n/client";
import { CONTACT_SUBJECTS } from "@/lib/contact";
import { IconInput, IconSelect, IconTextarea } from "@/components/ui/IconInput";

export function ContactForm() {
  const t = useT();
  const [state, action, pending] = useActionState<ContactState, FormData>(sendMessage, {});
  if (state.ok) {
    return (
      <div className="rounded-2xl border border-line bg-white p-10 text-center">
        <Icon name="check" size={44} className="mx-auto text-[#6aa84f]" />
        <p className="mt-3 text-xl font-bold">{t("Thanks! Your message has been sent.")}</p>
        <p className="mt-1 text-muted">{t("We'll get back to you by email.")}</p>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4 rounded-2xl border border-line bg-white p-6 sm:p-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm"><span className="mb-1 block font-semibold">{t("Name")}</span><IconInput icon="user" name="name" maxLength={100} required /></label>
        <label className="block text-sm"><span className="mb-1 block font-semibold">{t("Email")}</span><IconInput icon="mail" name="email" type="email" maxLength={254} required /></label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold">{t("Subject")}</span>
        <IconSelect icon="tag" name="subject" defaultValue="General">
          {CONTACT_SUBJECTS.map((s) => <option key={s} value={s}>{t(s)}</option>)}
        </IconSelect>
      </label>
      <label className="block text-sm"><span className="mb-1 block font-semibold">{t("Message")}</span><IconTextarea icon="message-2" className="min-h-36" name="message" required maxLength={5000} /></label>
      {state.error && <p className="text-sm text-brand">{state.error}</p>}
      <button className="btn-primary" disabled={pending}>{pending ? t("Sending…") : t("Send message")}</button>
    </form>
  );
}
