import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { SITE_URL } from "@/lib/site";
import { tokenHash } from "./auth";
import { DATA_DIR, db } from "./db";
import { sendSignCancelled, sendSignCompleted, sendSignDeclined, sendSignInvite, sendSignProgress } from "./emails";
import { logError } from "./monitor";
import { drawableText } from "./pdf-helpers";
import { certificateInfo, sealPdf } from "./pdf-sign";
import { seal, unseal } from "./secret";
import { dispatchWebhook } from "./webhooks";

// Signature requests with several signers, optional signing order, email
// invitations and reminders, and an audit trail. Files live in
// data/signatures/<id>/: original.pdf, current.pdf (signatures so far) and
// final.pdf (audit trail + digital seal, once everyone has signed).

export const SIGN_DIR = path.join(DATA_DIR, "signatures");
export const SIGN_TTL_MS = 30 * 86_400_000;
export const MAX_SIGNERS = 20;

export type SignRequest = {
  id: string;
  owner_id: number | null;
  file_name: string;
  sender_name: string;
  sender_email: string | null;
  message: string;
  ordered: number;
  reminder_days: number;
  status: "pending" | "completed" | "declined" | "cancelled";
  lang: string;
  document_hash: string;
  created_at: number;
  expires_at: number;
  completed_at: number | null;
};

export type Signer = {
  id: number;
  request_id: string;
  position: number;
  name: string;
  email: string | null;
  status: "waiting" | "ready" | "viewed" | "signed" | "declined";
  notified_at: number | null;
  reminded_at: number | null;
  viewed_at: number | null;
  signed_at: number | null;
  decline_reason: string | null;
};

export type SignEvent = {
  id: number;
  signer_id: number | null;
  event: string;
  at: number;
  ip: string | null;
  user_agent: string | null;
  detail: string | null;
};

export type Client = { ip: string | null; userAgent: string | null };

const ID_RE = /^[A-Za-z0-9_-]{22}$/;

export function requestDir(id: string) {
  return ID_RE.test(id) ? path.join(SIGN_DIR, id) : null;
}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
export const signerLink = (token: string) => `/sign/${token}`;
export const manageLink = (token: string) => `/sign/manage/${token}`;

function event(requestId: string, signerId: number | null, name: string, client?: Client, detail?: string) {
  db.prepare("INSERT INTO sign_events (request_id, signer_id, event, at, ip, user_agent, detail) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    requestId,
    signerId,
    name,
    Date.now(),
    client?.ip ?? null,
    client?.userAgent?.slice(0, 300) ?? null,
    detail?.slice(0, 500) ?? null,
  );
}

// ---------- Reading ----------

export function getRequest(id: string): SignRequest | null {
  if (!ID_RE.test(id)) return null;
  return (db.prepare("SELECT * FROM sign_requests WHERE id = ?").get(id) as SignRequest | undefined) ?? null;
}

export const isExpired = (r: SignRequest) => r.status === "pending" && Date.now() > r.expires_at;

export function signersOf(requestId: string): Signer[] {
  return db
    .prepare(
      `SELECT id, request_id, position, name, email, status, notified_at, reminded_at, viewed_at, signed_at, decline_reason
       FROM signers WHERE request_id = ? ORDER BY position`,
    )
    .all(requestId) as Signer[];
}

export function eventsOf(requestId: string): SignEvent[] {
  return db
    .prepare("SELECT id, signer_id, event, at, ip, user_agent, detail FROM sign_events WHERE request_id = ? ORDER BY at, id")
    .all(requestId) as SignEvent[];
}

/** The signer behind a personal link (new 43-character tokens, or a legacy request id). */
export function signerByToken(token: string): { signer: Signer; request: SignRequest } | null {
  if (!/^[A-Za-z0-9_-]{22,64}$/.test(token)) return null;
  const hash = ID_RE.test(token) ? `legacy:${token}` : tokenHash(token);
  const row = db.prepare("SELECT request_id, id FROM signers WHERE token_hash = ?").get(hash) as
    | { request_id: string; id: number }
    | undefined;
  const request = row && getRequest(row.request_id);
  if (!row || !request) return null;
  const signer = signersOf(request.id).find((s) => s.id === row.id)!;
  return { signer, request };
}

export function requestByManageToken(token: string): SignRequest | null {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return (db.prepare("SELECT * FROM sign_requests WHERE manage_hash = ?").get(tokenHash(token)) as SignRequest | undefined) ?? null;
}

export type RequestSummary = SignRequest & { signer_count: number; signed_count: number };

export function requestsForUser(userId: number, limit = 100): RequestSummary[] {
  return db
    .prepare(
      `SELECT r.*, COUNT(s.id) AS signer_count, SUM(s.status = 'signed') AS signed_count
       FROM sign_requests r LEFT JOIN signers s ON s.request_id = r.id
       WHERE r.owner_id = ? GROUP BY r.id ORDER BY r.created_at DESC LIMIT ?`,
    )
    .all(userId, limit) as RequestSummary[];
}

/** The newest file: the sealed final PDF, else the PDF with the signatures so far. */
export function documentPath(r: SignRequest, which: "current" | "final") {
  const dir = requestDir(r.id)!;
  if (which === "final") {
    for (const name of ["final.pdf", "signed.pdf"]) if (existsSync(path.join(dir, name))) return path.join(dir, name);
    return null;
  }
  for (const name of ["current.pdf", "original.pdf"]) if (existsSync(path.join(dir, name))) return path.join(dir, name);
  return null;
}

// ---------- Creating ----------

export type NewSigner = { name: string; email: string | null };

export async function createRequest(opts: {
  ownerId: number | null;
  senderName: string;
  senderEmail: string | null;
  fileName: string;
  message: string;
  ordered: boolean;
  reminderDays: number;
  lang: string;
  signers: NewSigner[];
  bytes: Uint8Array;
  client: Client;
}) {
  void sweepExpired();
  const id = randomBytes(16).toString("base64url"); // 22 unguessable characters
  const manageToken = randomBytes(32).toString("base64url");
  const signerTokens = opts.signers.map(() => randomBytes(32).toString("base64url"));
  const dir = path.join(SIGN_DIR, id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "original.pdf"), opts.bytes);
  await writeFile(path.join(dir, "current.pdf"), opts.bytes);
  const now = Date.now();

  db.transaction(() => {
    db.prepare(
      `INSERT INTO sign_requests (id, owner_id, manage_hash, file_name, sender_name, sender_email, message, ordered,
         reminder_days, status, lang, document_hash, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
    ).run(id, opts.ownerId, tokenHash(manageToken), opts.fileName, opts.senderName, opts.senderEmail, opts.message,
      opts.ordered ? 1 : 0, opts.reminderDays, opts.lang, sha256(opts.bytes), now, now + SIGN_TTL_MS);
    opts.signers.forEach((s, i) => {
      db.prepare("INSERT INTO signers (request_id, token_hash, token_enc, position, name, email, status) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
        id,
        tokenHash(signerTokens[i]),
        seal(signerTokens[i]),
        i,
        s.name,
        s.email,
        opts.ordered && i > 0 ? "waiting" : "ready",
      );
    });
    event(id, null, "created", opts.client, `${opts.senderName}${opts.senderEmail ? ` <${opts.senderEmail}>` : ""}`);
  });

  const request = getRequest(id)!;
  const signers = signersOf(id);
  for (const s of signers) if (s.status === "ready") await invite(request, s);
  return {
    id,
    manageToken,
    signers: signers.map((s, i) => ({ name: s.name, email: s.email, link: signerLink(signerTokens[i]) })),
  };
}

/** A signer's personal link, readable again so later emails repeat the same link. */
export function linkOf(signer: Pick<Signer, "id">): string | null {
  const row = db.prepare("SELECT token_enc FROM signers WHERE id = ?").get(signer.id) as { token_enc: string | null } | undefined;
  const token = row?.token_enc ? unseal(row.token_enc) : null;
  return token ? signerLink(token) : null;
}

/** Emails a signer their personal link (when they have an email address). */
async function invite(request: SignRequest, signer: Signer, reminder = false) {
  const link = linkOf(signer);
  if (!signer.email || !link) return false;
  await sendSignInvite({
    to: signer.email,
    lang: request.lang,
    signerName: signer.name,
    senderName: request.sender_name,
    fileName: request.file_name,
    message: request.message,
    link,
    expiresAt: request.expires_at,
    reminder,
  });
  const now = Date.now();
  if (reminder) db.prepare("UPDATE signers SET reminded_at = ? WHERE id = ?").run(now, signer.id);
  else db.prepare("UPDATE signers SET notified_at = ? WHERE id = ?").run(now, signer.id);
  event(request.id, signer.id, reminder ? "reminded" : "sent", undefined, signer.email);
  return true;
}

// ---------- Signing ----------

export function markViewed(request: SignRequest, signer: Signer, client: Client) {
  if (signer.status !== "ready") return;
  db.prepare("UPDATE signers SET status = 'viewed', viewed_at = ? WHERE id = ?").run(Date.now(), signer.id);
  event(request.id, signer.id, "viewed", client);
}

/** Whether this signer may sign now (their turn, request still open). */
export function canSign(request: SignRequest, signer: Signer) {
  return request.status === "pending" && !isExpired(request) && (signer.status === "ready" || signer.status === "viewed");
}

/**
 * Stores the signer's signed copy as the new current document and moves the
 * request on: notify the next signer, or seal the document when all signed.
 */
export async function recordSignature(request: SignRequest, signer: Signer, signedBytes: Uint8Array, client: Client) {
  const dir = requestDir(request.id)!;
  await writeFile(path.join(dir, "current.pdf"), signedBytes);
  db.prepare("UPDATE signers SET status = 'signed', signed_at = ? WHERE id = ?").run(Date.now(), signer.id);
  event(request.id, signer.id, "signed", client, sha256(signedBytes));
  void dispatchWebhook(request.owner_id, "signature.signed", { request_id: request.id, file_name: request.file_name, signer: { name: signer.name, email: signer.email } });

  const signers = signersOf(request.id);
  const remaining = signers.filter((s) => s.status !== "signed");
  if (!remaining.length) return finalize(request);

  if (request.ordered) {
    const next = remaining.find((s) => s.status === "waiting");
    if (next && !remaining.some((s) => s.status === "ready" || s.status === "viewed")) {
      db.prepare("UPDATE signers SET status = 'ready' WHERE id = ?").run(next.id);
      await invite(request, { ...next, status: "ready" });
    }
  }
  if (request.sender_email) {
    await sendSignProgress({
      to: request.sender_email,
      lang: request.lang,
      signerName: signer.name,
      fileName: request.file_name,
      manageLink: ownerLinkHint(request),
      remaining: remaining.length,
    });
  }
}

export function decline(request: SignRequest, signer: Signer, reason: string, client: Client) {
  db.transaction(() => {
    db.prepare("UPDATE signers SET status = 'declined', decline_reason = ? WHERE id = ?").run(reason.slice(0, 500), signer.id);
    db.prepare("UPDATE sign_requests SET status = 'declined' WHERE id = ?").run(request.id);
    event(request.id, signer.id, "declined", client, reason);
  });
  void dispatchWebhook(request.owner_id, "signature.declined", { request_id: request.id, file_name: request.file_name, signer: { name: signer.name, email: signer.email }, reason });
  if (request.sender_email) {
    void sendSignDeclined({
      to: request.sender_email,
      lang: request.lang,
      signerName: signer.name,
      reason,
      fileName: request.file_name,
      manageLink: ownerLinkHint(request),
    });
  }
}

export async function cancel(request: SignRequest, client: Client) {
  if (request.status !== "pending") return;
  db.prepare("UPDATE sign_requests SET status = 'cancelled' WHERE id = ?").run(request.id);
  event(request.id, null, "cancelled", client);
  for (const s of signersOf(request.id)) {
    if (s.email && s.notified_at && s.status !== "signed") {
      await sendSignCancelled({ to: s.email, lang: request.lang, name: s.name, senderName: request.sender_name, fileName: request.file_name });
    }
  }
}

/** Emails everyone whose turn it is and who has not signed yet. Returns how many were reminded. */
export async function remind(request: SignRequest, client?: Client) {
  if (request.status !== "pending" || isExpired(request)) return 0;
  let n = 0;
  for (const s of signersOf(request.id)) {
    if ((s.status === "ready" || s.status === "viewed") && (await invite(request, s, true))) n++;
  }
  if (n && client) event(request.id, null, "reminded", client, `${n}`);
  return n;
}

/**
 * Owners who signed in manage requests from their account; the management
 * link itself is only shown once, at creation. Emails point to the account.
 */
const ownerLinkHint = (request: SignRequest) => (request.owner_id ? `/account/signatures/${request.id}` : "/account/signatures");

// ---------- Completion ----------

const EVENT_LABEL: Record<string, string> = {
  created: "Request created",
  sent: "Invitation emailed",
  viewed: "Document opened",
  signed: "Signed",
  declined: "Declined",
  reminded: "Reminder sent",
  completed: "Completed and sealed",
  cancelled: "Cancelled",
};

function wrap(font: PDFFont, text: string, size: number, width: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Appends "Signature certificate" pages: document, signers and every event. */
async function appendAuditTrail(doc: PDFDocument, request: SignRequest, finalHashOfSigned: string) {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const signers = signersOf(request.id);
  const events = eventsOf(request.id);
  const cert = await certificateInfo();
  const [W, H] = [595.28, 841.89];
  const M = 48;
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;
  const gray = rgb(0.4, 0.4, 0.45);
  const brand = rgb(0.9, 0.2, 0.18);

  const ensure = (h: number) => {
    if (y - h < M) {
      page = doc.addPage([W, H]);
      y = H - M;
    }
  };
  const text = (s: string, size = 9, f = font, color = rgb(0.13, 0.13, 0.15), x = M, maxW = W - 2 * M) => {
    for (const line of wrap(f, drawableText(f, s), size, maxW)) {
      ensure(size + 4);
      page.drawText(line, { x, y: y - size, size, font: f, color });
      y -= size + 4;
    }
  };
  const gap = (h = 8) => (y -= h);
  const date = (ms: number | null) => (ms ? new Date(ms).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "—");

  page.drawText("Workify", { x: M, y: y - 20, size: 20, font: bold, color: brand });
  y -= 30;
  text("Signature certificate", 16, bold);
  gap();
  text(`Document: ${request.file_name}`, 10);
  text(`Request ID: ${request.id}`, 10);
  text(`Sent by: ${request.sender_name}${request.sender_email ? ` <${request.sender_email}>` : ""}`, 10);
  text(`Created: ${date(request.created_at)}    Completed: ${date(Date.now())}`, 10);
  text(`Signing order: ${request.ordered ? "in the order listed" : "any order"}`, 10);
  text(`SHA-256 of the original document: ${request.document_hash}`, 8, font, gray);
  text(`SHA-256 of the signed document before this certificate: ${finalHashOfSigned}`, 8, font, gray);
  gap(12);

  text("Signers", 12, bold);
  gap(4);
  for (const s of signers) {
    ensure(40);
    text(`${s.position + 1}. ${s.name}${s.email ? ` <${s.email}>` : ""}`, 10, bold);
    const signedEvent = events.find((e) => e.signer_id === s.id && e.event === "signed");
    text(`Signed: ${date(s.signed_at)}    Opened: ${date(s.viewed_at)}`, 9, font, gray, M + 14);
    if (signedEvent) text(`IP address: ${signedEvent.ip ?? "unknown"}    Browser: ${signedEvent.user_agent ?? "unknown"}`, 8, font, gray, M + 14, W - 2 * M - 14);
    gap(4);
  }
  gap(8);

  text("Audit trail", 12, bold);
  gap(4);
  const names = new Map(signers.map((s) => [s.id, s.name]));
  for (const e of [...events, { id: 0, signer_id: null, event: "completed", at: Date.now(), ip: null, user_agent: null, detail: null }]) {
    const who = e.signer_id ? names.get(e.signer_id) ?? "" : "";
    text(`${date(e.at)}  ·  ${EVENT_LABEL[e.event] ?? e.event}${who ? `  ·  ${who}` : ""}${e.ip ? `  ·  IP ${e.ip}` : ""}`, 8.5);
  }
  gap(12);
  text("Digital signature", 12, bold);
  text(`This document is sealed with a digital signature by "${cert.subject}" (SHA-256 fingerprint ${cert.fingerprint}). PDF readers show a warning if the file is changed after sealing.${cert.selfSigned ? " The certificate is issued by Workify itself, so readers may report that its identity cannot be verified; the integrity check still applies." : ""}`, 8.5, font, gray);
  text(`Verify at ${SITE_URL}`, 8.5, font, gray);
}

async function finalize(request: SignRequest) {
  const dir = requestDir(request.id)!;
  try {
    const signed = await readFile(path.join(dir, "current.pdf"));
    const doc = await PDFDocument.load(signed);
    await appendAuditTrail(doc, request, sha256(signed));
    const sealed = await sealPdf(doc, {
      reason: `Signed by ${signersOf(request.id).map((s) => s.name).join(", ")}`,
      location: new URL(SITE_URL).hostname,
      contactInfo: request.sender_email ?? "",
    });
    await writeFile(path.join(dir, "final.pdf"), sealed);
  } catch (e) {
    // Never lose the signatures: fall back to the signed copy without a seal.
    logError("sign-finalize", `Could not seal request ${request.id}`, e);
    await copyFile(path.join(dir, "current.pdf"), path.join(dir, "final.pdf"));
  }
  db.prepare("UPDATE sign_requests SET status = 'completed', completed_at = ? WHERE id = ?").run(Date.now(), request.id);
  event(request.id, null, "completed");
  void dispatchWebhook(request.owner_id, "signature.completed", { request_id: request.id, file_name: request.file_name });

  const signers = signersOf(request.id);
  for (const s of signers) {
    // The signer's own page now offers the final download.
    const link = linkOf(s);
    if (s.email && link) await sendSignCompleted({ to: s.email, lang: request.lang, name: s.name, fileName: request.file_name, link });
  }
  if (request.sender_email) {
    await sendSignCompleted({ to: request.sender_email, lang: request.lang, name: request.sender_name, fileName: request.file_name, link: ownerLinkHint(request) });
  }
}

// ---------- Housekeeping (run by the scheduler) ----------

/** Sends automatic reminders for requests that asked for them. */
export async function sendDueReminders() {
  const now = Date.now();
  const due = db
    .prepare("SELECT * FROM sign_requests WHERE status = 'pending' AND reminder_days > 0 AND expires_at > ?")
    .all(now) as SignRequest[];
  for (const r of due) {
    const every = r.reminder_days * 86_400_000;
    for (const s of signersOf(r.id)) {
      const last = s.reminded_at ?? s.notified_at;
      if ((s.status === "ready" || s.status === "viewed") && s.email && last && now - last >= every) {
        await invite(r, s, true);
      }
    }
  }
}

/** Deletes requests (and their files) 30 days after creation. Runs at most once an hour. */
let lastSweep = 0;
export async function sweepExpired() {
  if (Date.now() - lastSweep < 3_600_000) return;
  lastSweep = Date.now();
  const old = db.prepare("SELECT id FROM sign_requests WHERE expires_at < ?").all(Date.now()) as { id: string }[];
  for (const { id } of old) {
    const dir = requestDir(id);
    if (dir) await rm(dir, { recursive: true, force: true });
  }
  db.prepare("DELETE FROM sign_requests WHERE expires_at < ?").run(Date.now());
}
