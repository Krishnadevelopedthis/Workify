import "server-only";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { db } from "./db";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

const COOKIE = "wf_session";
const SESSION_DAYS = 30;

export type User = {
  id: number;
  name: string;
  email: string;
  verified: boolean;
  admin: boolean;
  lang: string;
  createdAt: number;
};

type UserRow = {
  id: number;
  name: string;
  email: string;
  email_verified_at: number | null;
  role: string;
  lang: string;
  created_at: number;
};

/** Admins: users with the "admin" role, or listed in WORKIFY_ADMIN_EMAILS. Both need a verified email. */
export function isAdmin(row: Pick<UserRow, "email" | "role" | "email_verified_at">) {
  if (!row.email_verified_at) return false;
  const listed = (process.env.WORKIFY_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return row.role === "admin" || listed.includes(row.email.toLowerCase());
}

export const toUser = (row: UserRow): User => ({
  id: row.id,
  name: row.name,
  email: row.email,
  verified: Boolean(row.email_verified_at),
  admin: isAdmin(row),
  lang: row.lang,
  createdAt: row.created_at,
});

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [saltHex, keyHex] = stored.split(":");
  if (!saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

// Only a hash of a token (session, API key, emailed link) is stored, so a
// leaked database cannot be replayed.
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export const newToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export async function startSession(userId: number) {
  // Expired sessions are cleared here (indexed by expires_at), keeping the table small.
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
  const token = newToken();
  const expires = Date.now() + SESSION_DAYS * 86_400_000;
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(tokenHash(token), userId, expires);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expires),
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash(token));
  jar.delete(COOKIE);
}

/** Signs the user out everywhere (password change/reset, suspension, deletion). */
export function revokeSessions(userId: number) {
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.email_verified_at, u.role, u.lang, u.created_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND u.disabled_at IS NULL`,
    )
    .get(tokenHash(token), Date.now()) as UserRow | undefined;
  return row ? toUser(row) : null;
}

export function userById(id: number): User | null {
  const row = db
    .prepare("SELECT id, name, email, email_verified_at, role, lang, created_at FROM users WHERE id = ? AND disabled_at IS NULL")
    .get(id) as UserRow | undefined;
  return row ? toUser(row) : null;
}

/** Every admin's email address (for alerts). */
export function adminEmails(): string[] {
  const rows = db
    .prepare("SELECT email, role, email_verified_at FROM users WHERE disabled_at IS NULL AND email_verified_at IS NOT NULL")
    .all() as Pick<UserRow, "email" | "role" | "email_verified_at">[];
  return rows.filter(isAdmin).map((r) => r.email);
}
