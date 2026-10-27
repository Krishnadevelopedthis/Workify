"use server";

import { headers } from "next/headers";
import { requestT } from "@/i18n/request";
import { db } from "@/server/db";
import { rateLimit } from "@/server/rate-limit";
import { isEmail, normalizeEmail } from "@/lib/validation";

export type WaitlistState = { error?: string; ok?: boolean };

/** "Notify me when Premium launches". */
export async function joinWaitlist(_prev: WaitlistState, form: FormData): Promise<WaitlistState> {
  const { t, lang } = await requestT();
  const limited = rateLimit("contact", await headers());
  if (limited) return { error: t(limited) };
  const email = normalizeEmail(form.get("email"));
  if (!isEmail(email)) return { error: t("Please enter a valid email address.") };
  db.prepare("INSERT OR IGNORE INTO premium_waitlist (email, lang, created_at) VALUES (?, ?, ?)").run(email, lang, Date.now());
  return { ok: true };
}
