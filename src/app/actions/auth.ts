"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser, endSession, hashPassword, startSession, verifyPassword } from "@/server/auth";
import { db } from "@/server/db";
import { rateLimit } from "@/server/rate-limit";

export type AuthState = { error?: string; values?: { name?: string; email?: string } };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PASSWORD = 200; // scrypt work must stay bounded

/**
 * Only allow redirects to a path on this site. Parsing as a URL catches tricks
 * like "//evil.com" and "/\evil.com", which browsers treat as other hosts.
 */
function safeNext(raw: FormDataEntryValue | null) {
  const next = String(raw ?? "/");
  try {
    const base = "http://workify.invalid";
    const url = new URL(next, base);
    if (url.origin !== base || !next.startsWith("/")) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}

// A real hash of a random password, so failed logins for unknown emails take
// as long as for known ones and do not reveal which emails are registered.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashPassword(crypto.randomUUID()));

export async function signup(_prev: AuthState, form: FormData): Promise<AuthState> {
  const name = String(form.get("name") ?? "").trim().slice(0, 100);
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 254);
  const password = String(form.get("password") ?? "");
  const values = { name, email };

  const limited = rateLimit("auth", await headers());
  if (limited) return { error: limited, values };
  if (name.length < 2) return { error: "Please enter your name.", values };
  if (!EMAIL_RE.test(email)) return { error: "Please enter a valid email address.", values };
  if (password.length < 8) return { error: "Your password must be at least 8 characters.", values };
  if (password.length > MAX_PASSWORD) return { error: `Use a password of at most ${MAX_PASSWORD} characters.`, values };

  const exists = db.prepare("SELECT 1 FROM users WHERE email = ?").get(email);
  if (exists) return { error: "An account with this email already exists. Log in instead.", values };

  const result = db
    .prepare("INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
    .run(name, email, await hashPassword(password), Date.now());
  await startSession(Number(result.lastInsertRowid));
  redirect(safeNext(form.get("next")));
}

export async function login(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 254);
  const password = String(form.get("password") ?? "").slice(0, MAX_PASSWORD);
  // Limited per client and per email, so guessing one account's password is slow
  // even from many addresses.
  const limited = rateLimit("auth", await headers(), `login:${email}`);
  if (limited) return { error: limited, values: { email } };

  const row = db.prepare("SELECT id, password_hash FROM users WHERE email = ?").get(email) as
    | { id: number; password_hash: string }
    | undefined;
  const ok = await verifyPassword(password, row?.password_hash ?? (await getDummyHash()));
  // Same message either way, so the form does not reveal which emails exist.
  if (!row || !ok) return { error: "Incorrect email or password.", values: { email } };
  await startSession(row.id);
  redirect(safeNext(form.get("next")));
}

export type PasswordState = { error?: string; ok?: boolean };

export async function changePassword(_prev: PasswordState, form: FormData): Promise<PasswordState> {
  const user = await currentUser();
  if (!user) return { error: "Please log in again." };
  const limited = rateLimit("auth", await headers(), `pw:${user.id}`);
  if (limited) return { error: limited };
  const current = String(form.get("current") ?? "").slice(0, MAX_PASSWORD);
  const next = String(form.get("next") ?? "");
  if (next.length < 8) return { error: "Your new password must be at least 8 characters." };
  if (next.length > MAX_PASSWORD) return { error: `Use a password of at most ${MAX_PASSWORD} characters.` };
  const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id) as { password_hash: string };
  if (!(await verifyPassword(current, row.password_hash))) return { error: "Your current password is incorrect." };
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await hashPassword(next), user.id);
  // Sign out every other device that knew the old password.
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
  await startSession(user.id);
  return { ok: true };
}

export async function logout() {
  await endSession();
  redirect("/");
}
