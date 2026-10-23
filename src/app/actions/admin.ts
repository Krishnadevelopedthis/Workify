"use server";

import { rm } from "node:fs/promises";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/admin";
import { revokeSessions } from "@/server/auth";
import { createBackup } from "@/server/backup";
import { db } from "@/server/db";
import { sendContactReply } from "@/server/emails";
import { deliver, renderEmail, sendEmail, smtpConfigured, verifySmtp } from "@/server/mail";
import { requestDir } from "@/server/sign-requests";

// Admin-only actions. Every action checks the role again on the server.

const refresh = () => revalidatePath("/[lang]/admin", "layout");

export async function setUserRole(id: number, role: "admin" | "user") {
  const me = await requireAdmin();
  if (id === me.id && role !== "admin") return { error: "You can't remove your own admin role." };
  db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, id);
  refresh();
  return {};
}

export async function setUserDisabled(id: number, disabled: boolean) {
  const me = await requireAdmin();
  if (id === me.id) return { error: "You can't suspend your own account." };
  db.prepare("UPDATE users SET disabled_at = ? WHERE id = ?").run(disabled ? Date.now() : null, id);
  if (disabled) revokeSessions(id);
  refresh();
  return {};
}

export async function verifyUser(id: number) {
  await requireAdmin();
  db.prepare("UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?").run(Date.now(), id);
  refresh();
  return {};
}

export async function deleteUser(id: number) {
  const me = await requireAdmin();
  if (id === me.id) return { error: "Delete your own account from the account page." };
  const requests = db.prepare("SELECT id FROM sign_requests WHERE owner_id = ?").all(id) as { id: string }[];
  db.transaction(() => {
    db.prepare("DELETE FROM sign_requests WHERE owner_id = ?").run(id);
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
  });
  for (const r of requests) {
    const dir = requestDir(r.id);
    if (dir) await rm(dir, { recursive: true, force: true });
  }
  refresh();
  return {};
}

export async function setMessageHandled(id: number, handled: boolean) {
  await requireAdmin();
  db.prepare("UPDATE contact_messages SET handled_at = ? WHERE id = ?").run(handled ? Date.now() : null, id);
  refresh();
  return {};
}

export async function replyToMessage(id: number, reply: string) {
  await requireAdmin();
  const msg = db.prepare("SELECT * FROM contact_messages WHERE id = ?").get(id) as
    | { name: string; email: string; subject: string; message: string; lang: string }
    | undefined;
  if (!msg) return { error: "Message not found." };
  if (!reply.trim()) return { error: "Write a reply first." };
  await sendContactReply({ to: msg.email, lang: msg.lang, name: msg.name, subject: msg.subject, reply: reply.trim().slice(0, 10_000), original: msg.message });
  db.prepare("UPDATE contact_messages SET handled_at = ? WHERE id = ?").run(Date.now(), id);
  refresh();
  return {};
}

export async function deleteMessage(id: number) {
  await requireAdmin();
  db.prepare("DELETE FROM contact_messages WHERE id = ?").run(id);
  refresh();
  return {};
}

export async function resendEmail(id: number) {
  await requireAdmin();
  if (!smtpConfigured()) return { error: "SMTP is not configured, so emails can't be sent yet." };
  db.prepare("UPDATE outbox SET status = 'queued', attempts = 0, error = NULL WHERE id = ?").run(id);
  await deliver(id);
  refresh();
  return {};
}

export async function testSmtp(to: string) {
  const me = await requireAdmin();
  const problem = await verifySmtp();
  if (problem) return { error: problem };
  sendEmail(
    renderEmail({
      to: to.trim() || me.email,
      subject: "Workify test email",
      heading: "SMTP works",
      paragraphs: ["This test email was sent from the Workify admin panel."],
      footer: "Sent by Workify.",
    }),
  );
  refresh();
  return {};
}

export async function backupNow() {
  await requireAdmin();
  const b = await createBackup();
  refresh();
  return { name: b.name };
}

export async function clearErrors() {
  await requireAdmin();
  db.prepare("DELETE FROM error_log").run();
  refresh();
  return {};
}
