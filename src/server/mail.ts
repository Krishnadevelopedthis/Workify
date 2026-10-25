import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { SITE_URL } from "@/lib/site";
import { db } from "./db";
import { logError } from "./monitor";

// Every email goes through the outbox table: it is stored first, then sent.
// Without SMTP settings the email stays in the outbox with status "logged",
// where admins can read it (useful in development and before SMTP is set up).
//
// Emails carry secret links (signing, password reset, email confirmation), so
// the stored copy keeps them only while they may still be needed: while the
// email is queued or failed (for retries), and for under an hour when it is
// only logged. Once sent, or after that hour, every link in the stored html
// and text is replaced by REDACTED_LINK; address, subject, status and times stay.

export type Email = { to: string; subject: string; html: string; text: string };
export type OutboxRow = Email & { id: number; to_email: string; status: string; attempts: number; error: string | null; created_at: number; sent_at: number | null };

const MAX_ATTEMPTS = 5;
/** Logged emails keep their links this long; the 10-minute scheduler redacts them within the hour. */
const LOGGED_KEEP_MS = 50 * 60_000;
export const REDACTED_LINK = "[link removed]";
const URL_RE = /https?:\/\/[^\s"'<>]+/gi;
const g = globalThis as unknown as { workifyMailer?: Transporter | null };

export const smtpConfigured = () => Boolean(process.env.SMTP_HOST);

function transport(): Transporter | null {
  if (g.workifyMailer !== undefined) return g.workifyMailer;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  g.workifyMailer = host
    ? nodemailer.createTransport({
        host,
        port,
        secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" } : undefined,
      })
    : null;
  return g.workifyMailer;
}

const sender = () => process.env.MAIL_FROM || `Workify <no-reply@${new URL(SITE_URL).hostname}>`;

/** Stores the email and starts sending it; failures are retried by the scheduler. */
export function sendEmail(email: Email) {
  const status = transport() ? "queued" : "logged";
  const { lastInsertRowid } = db
    .prepare("INSERT INTO outbox (to_email, subject, html, text, status, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(email.to, email.subject.slice(0, 300), email.html, email.text, status, Date.now());
  if (status === "logged") console.info(`[mail] SMTP is not configured; email to ${email.to} kept in the outbox: ${email.subject}`);
  else void deliver(Number(lastInsertRowid));
}

const redact = (s: string) => s.replace(URL_RE, REDACTED_LINK);

/** The text the admin panel may show: links only while the email may still need them. */
export const outboxPreview = (row: { text: string; status: string; created_at: number }) =>
  row.status === "queued" || row.status === "failed" || (row.status === "logged" && row.created_at >= Date.now() - LOGGED_KEEP_MS)
    ? row.text
    : redact(row.text);

/**
 * True when the stored copy no longer has its links, so it must not be sent
 * again. (A message that merely quotes the placeholder still has its links.)
 */
export const isRedacted = (row: { text: string }) => row.text.includes(REDACTED_LINK) && !/https?:\/\//i.test(row.text);

export async function deliver(id: number) {
  const row = db.prepare("SELECT * FROM outbox WHERE id = ?").get(id) as OutboxRow | undefined;
  const mailer = transport();
  if (!row || !mailer || row.status === "sent") return;
  if (isRedacted(row)) {
    db.prepare("UPDATE outbox SET status = 'failed', error = ? WHERE id = ?").run("The links in this email were removed after an hour, so it can't be sent again.", id);
    return;
  }
  try {
    await mailer.sendMail({ from: sender(), to: row.to_email, subject: row.subject, html: row.html, text: row.text });
    db.prepare("UPDATE outbox SET status = 'sent', sent_at = ?, attempts = attempts + 1, error = NULL, html = ?, text = ? WHERE id = ?").run(
      Date.now(),
      redact(row.html),
      redact(row.text),
      id,
    );
  } catch (e) {
    const attempts = row.attempts + 1;
    const failed = attempts >= MAX_ATTEMPTS;
    db.prepare("UPDATE outbox SET status = ?, attempts = ?, error = ? WHERE id = ?").run(
      failed ? "failed" : "queued",
      attempts,
      String(e).slice(0, 500),
      id,
    );
    if (failed) logError("mail", `Email to ${row.to_email} could not be sent`, e);
  }
}

/** Retries emails that are still queued a minute after they were created. */
export async function retryQueuedEmails() {
  if (!transport()) return;
  const rows = db
    .prepare("SELECT id FROM outbox WHERE status = 'queued' AND created_at < ? ORDER BY id LIMIT 50")
    .all(Date.now() - 60_000) as { id: number }[];
  for (const r of rows) await deliver(r.id);
}

/**
 * Removes the links from sent emails and from logged emails older than
 * LOGGED_KEEP_MS (scheduler). Queued and failed emails keep theirs for retries.
 */
export function redactOutbox() {
  const rows = db
    .prepare(
      `SELECT id, html, text FROM outbox
       WHERE (status = 'sent' OR (status = 'logged' AND created_at < ?))
         AND (html LIKE '%http://%' OR html LIKE '%https://%' OR text LIKE '%http://%' OR text LIKE '%https://%')`,
    )
    .all(Date.now() - LOGGED_KEEP_MS) as { id: number; html: string; text: string }[];
  const update = db.prepare("UPDATE outbox SET html = ?, text = ? WHERE id = ?");
  for (const r of rows) update.run(redact(r.html), redact(r.text), r.id);
  return rows.length;
}

/** Checks the SMTP connection (admin panel). */
export async function verifySmtp(): Promise<string | null> {
  const mailer = transport();
  if (!mailer) return "SMTP is not configured.";
  try {
    await mailer.verify();
    return null;
  } catch (e) {
    return String(e);
  }
}

// ---------- Layout ----------

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const absoluteUrl = (path: string) => (path.startsWith("http") ? path : `${SITE_URL}${path}`);

/**
 * A simple branded email. `paragraphs` are plain text (escaped here);
 * `quote` is shown as a highlighted block (e.g. a personal message).
 */
export function renderEmail(opts: {
  to: string;
  subject: string;
  heading: string;
  paragraphs: string[];
  quote?: string;
  button?: { label: string; url: string };
  footer: string;
  dir?: "ltr" | "rtl";
}): Email {
  const { heading, paragraphs, quote, button, footer, dir = "ltr" } = opts;
  const url = button && absoluteUrl(button.url);
  const html = `<!doctype html><html dir="${dir}"><body style="margin:0;background:#f4f4f9;font-family:Arial,Helvetica,sans-serif;color:#33333b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:32px">
<tr><td style="font-size:24px;font-weight:800;color:#33333b">Worki<span style="color:#ff7a1a">fy</span></td></tr>
<tr><td style="padding-top:24px;font-size:20px;font-weight:700">${esc(heading)}</td></tr>
${paragraphs.map((p) => `<tr><td style="padding-top:12px;font-size:15px;line-height:22px">${esc(p)}</td></tr>`).join("")}
${quote ? `<tr><td style="padding-top:16px"><div style="border-inline-start:4px solid #e5322d;background:#f4f4f9;padding:12px 16px;font-size:15px;line-height:22px;white-space:pre-wrap">${esc(quote)}</div></td></tr>` : ""}
${url ? `<tr><td style="padding-top:24px"><a href="${esc(url)}" style="display:inline-block;background:#e5322d;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:8px">${esc(button!.label)}</a></td></tr>
<tr><td style="padding-top:12px;font-size:12px;color:#77778a;word-break:break-all">${esc(url)}</td></tr>` : ""}
<tr><td style="padding-top:28px;font-size:12px;color:#77778a">${esc(footer)}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [heading, "", ...paragraphs, ...(quote ? ["", quote] : []), ...(url ? ["", `${button!.label}: ${url}`] : []), "", footer].join("\n");
  return { to: opts.to, subject: opts.subject, html, text };
}
