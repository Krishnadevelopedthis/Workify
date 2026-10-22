import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { DATA_DIR, db } from "./db";

export const SIGN_DIR = path.join(DATA_DIR, "signatures");
const MAX_AGE_MS = 30 * 86_400_000;

export type SignRequest = {
  id: string;
  owner_id: number | null;
  file_name: string;
  signer_name: string;
  message: string;
  status: "pending" | "signed";
  created_at: number;
  signed_at: number | null;
};

const ID_RE = /^[A-Za-z0-9_-]{22}$/;

export function requestDir(id: string) {
  return ID_RE.test(id) ? path.join(SIGN_DIR, id) : null;
}

export function getRequest(id: string): SignRequest | null {
  if (!ID_RE.test(id)) return null;
  const row = db.prepare("SELECT * FROM signature_requests WHERE id = ?").get(id) as SignRequest | undefined;
  if (!row || Date.now() - row.created_at > MAX_AGE_MS) return null;
  return row;
}

/** Deletes expired requests and their files. Runs at most once an hour. */
let lastSweep = 0;
async function sweepExpired() {
  if (Date.now() - lastSweep < 3_600_000) return;
  lastSweep = Date.now();
  const cutoff = Date.now() - MAX_AGE_MS;
  const old = db.prepare("SELECT id FROM signature_requests WHERE created_at < ?").all(cutoff) as { id: string }[];
  for (const { id } of old) {
    const dir = requestDir(id);
    if (dir) await rm(dir, { recursive: true, force: true });
  }
  db.prepare("DELETE FROM signature_requests WHERE created_at < ?").run(cutoff);
}

export async function createRequest(opts: {
  ownerId: number | null;
  fileName: string;
  signerName: string;
  message: string;
  bytes: Uint8Array;
}) {
  void sweepExpired();
  const id = randomBytes(16).toString("base64url"); // 22 unguessable characters
  const dir = path.join(SIGN_DIR, id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "original.pdf"), opts.bytes);
  db.prepare(
    `INSERT INTO signature_requests (id, owner_id, file_name, signer_name, message, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
  ).run(id, opts.ownerId, opts.fileName, opts.signerName, opts.message, Date.now());
  return id;
}

export function markSigned(id: string) {
  db.prepare("UPDATE signature_requests SET status = 'signed', signed_at = ? WHERE id = ?").run(Date.now(), id);
}

export function requestsForUser(userId: number): SignRequest[] {
  return db
    .prepare("SELECT * FROM signature_requests WHERE owner_id = ? ORDER BY created_at DESC LIMIT 50")
    .all(userId) as SignRequest[];
}
