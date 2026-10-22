"use client";

import { useActionState } from "react";
import { sendMessage, type ContactState } from "@/app/actions/contact";
import { Icon } from "@/components/Icon";

export function ContactForm() {
  const [state, action, pending] = useActionState<ContactState, FormData>(sendMessage, {});
  if (state.ok) {
    return (
      <div className="rounded-2xl border border-line bg-white p-10 text-center">
        <Icon name="check" size={44} className="mx-auto text-[#6aa84f]" />
        <p className="mt-3 text-xl font-bold">Thanks! Your message has been sent.</p>
        <p className="mt-1 text-muted">We&apos;ll get back to you by email.</p>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4 rounded-2xl border border-line bg-white p-6 sm:p-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm"><span className="mb-1 block font-semibold">Name</span><input className="input" name="name" required /></label>
        <label className="block text-sm"><span className="mb-1 block font-semibold">Email</span><input className="input" name="email" type="email" required /></label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold">Subject</span>
        <select className="input" name="subject" defaultValue="General">
          <option>General</option><option>Technical support</option><option>Business</option><option>Press</option><option>Feedback</option>
        </select>
      </label>
      <label className="block text-sm"><span className="mb-1 block font-semibold">Message</span><textarea className="input min-h-36" name="message" required maxLength={5000} /></label>
      {state.error && <p className="text-sm text-brand">{state.error}</p>}
      <button className="btn-primary" disabled={pending}>{pending ? "Sending…" : "Send message"}</button>
    </form>
  );
}
