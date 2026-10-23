"use server";

import { headers } from "next/headers";
import { requestT } from "@/i18n/request";
import { CONTACT_SUBJECTS } from "@/lib/contact";
import { db } from "@/server/db";
import { rateLimit } from "@/server/rate-limit";

export type ContactState = { error?: string; ok?: boolean };

export async function sendMessage(_prev: ContactState, form: FormData): Promise<ContactState> {
  const { t, lang } = await requestT();
  const name = String(form.get("name") ?? "").trim().slice(0, 100);
  const email = String(form.get("email") ?? "").trim().slice(0, 200);
  const subject = String(form.get("subject") ?? "").trim();
  const message = String(form.get("message") ?? "").trim().slice(0, 5000);
  if (!name || !email || !message) return { error: t("Please fill in your name, email and message.") };
  const limited = rateLimit("contact", await headers());
  if (limited) return { error: t(limited) };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: t("Please enter a valid email address.") };
  db.prepare("INSERT INTO contact_messages (name, email, subject, message, created_at, lang) VALUES (?, ?, ?, ?, ?, ?)").run(
    name,
    email,
    (CONTACT_SUBJECTS as readonly string[]).includes(subject) ? subject : "General",
    message,
    Date.now(),
    lang,
  );
  return { ok: true };
}
