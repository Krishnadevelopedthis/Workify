"use server";

import { headers } from "next/headers";
import { db } from "@/server/db";
import { rateLimit } from "@/server/rate-limit";

export type ContactState = { error?: string; ok?: boolean };

export async function sendMessage(_prev: ContactState, form: FormData): Promise<ContactState> {
  const name = String(form.get("name") ?? "").trim().slice(0, 100);
  const email = String(form.get("email") ?? "").trim().slice(0, 200);
  const subject = String(form.get("subject") ?? "").trim().slice(0, 150);
  const message = String(form.get("message") ?? "").trim().slice(0, 5000);
  if (!name || !email || !message) return { error: "Please fill in your name, email and message." };
  const limited = rateLimit("contact", await headers());
  if (limited) return { error: limited };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Please enter a valid email address." };
  db.prepare("INSERT INTO contact_messages (name, email, subject, message, created_at) VALUES (?, ?, ?, ?, ?)").run(
    name,
    email,
    subject || "General",
    message,
    Date.now(),
  );
  return { ok: true };
}
