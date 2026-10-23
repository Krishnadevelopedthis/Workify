"use server";

import { rm } from "node:fs/promises";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { localePath, splitLocale } from "@/i18n/config";
import { requestT } from "@/i18n/request";
import { currentUser, endSession, hashPassword, revokeSessions, startSession, verifyPassword } from "@/server/auth";
import { db } from "@/server/db";
import { sendAccountDeleted, sendEmailChange, sendPasswordChanged, sendResetEmail, sendVerifyEmail } from "@/server/emails";
import { rateLimit } from "@/server/rate-limit";
import { requestDir } from "@/server/sign-requests";
import { consumeToken, createToken } from "@/server/tokens";

export type AuthState = { error?: string; ok?: boolean; values?: { name?: string; email?: string } };

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
    return splitLocale(url.pathname)[1] + url.search + url.hash;
  } catch {
    return "/";
  }
}

// A real hash of a random password, so failed logins for unknown emails take
// as long as for known ones and do not reveal which emails are registered.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashPassword(crypto.randomUUID()));

function passwordProblem(password: string, t: (s: string, v?: Record<string, number>) => string) {
  if (password.length < 8) return t("Your password must be at least 8 characters.");
  if (password.length > MAX_PASSWORD) return t("Use a password of at most {max} characters.", { max: MAX_PASSWORD });
  return null;
}

export async function signup(_prev: AuthState, form: FormData): Promise<AuthState> {
  const { t, lang } = await requestT();
  const name = String(form.get("name") ?? "").trim().slice(0, 100);
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 254);
  const password = String(form.get("password") ?? "");
  const values = { name, email };

  const limited = rateLimit("auth", await headers());
  if (limited) return { error: t(limited), values };
  if (name.length < 2) return { error: t("Please enter your name."), values };
  if (!EMAIL_RE.test(email)) return { error: t("Please enter a valid email address."), values };
  const problem = passwordProblem(password, t);
  if (problem) return { error: problem, values };

  const exists = db.prepare("SELECT 1 FROM users WHERE email = ?").get(email);
  if (exists) return { error: t("An account with this email already exists. Log in instead."), values };

  const result = db
    .prepare("INSERT INTO users (name, email, password_hash, created_at, lang) VALUES (?, ?, ?, ?, ?)")
    .run(name, email, await hashPassword(password), Date.now(), lang);
  const userId = Number(result.lastInsertRowid);
  await sendVerifyEmail(email, name, lang, createToken(userId, "verify"));
  await startSession(userId);
  redirect(localePath(lang, safeNext(form.get("next"))));
}

export async function login(_prev: AuthState, form: FormData): Promise<AuthState> {
  const { t, lang } = await requestT();
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 254);
  const password = String(form.get("password") ?? "").slice(0, MAX_PASSWORD);
  // Limited per client and per email, so guessing one account's password is slow
  // even from many addresses.
  const limited = rateLimit("auth", await headers(), `login:${email}`);
  if (limited) return { error: t(limited), values: { email } };

  const row = db.prepare("SELECT id, password_hash, disabled_at FROM users WHERE email = ?").get(email) as
    | { id: number; password_hash: string; disabled_at: number | null }
    | undefined;
  const ok = await verifyPassword(password, row?.password_hash ?? (await getDummyHash()));
  // Same message either way, so the form does not reveal which emails exist.
  if (!row || !ok) return { error: t("Incorrect email or password."), values: { email } };
  if (row.disabled_at) return { error: t("This account has been suspended. Contact us if you think this is a mistake."), values: { email } };
  await startSession(row.id);
  redirect(localePath(lang, safeNext(form.get("next"))));
}

export async function logout() {
  await endSession();
}

// ---------- Forgotten password ----------

export async function requestPasswordReset(_prev: AuthState, form: FormData): Promise<AuthState> {
  const { t, lang } = await requestT();
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 254);
  const limited = rateLimit("auth", await headers(), `reset:${email}`);
  if (limited) return { error: t(limited), values: { email } };
  if (!EMAIL_RE.test(email)) return { error: t("Please enter a valid email address."), values: { email } };
  const row = db.prepare("SELECT id, name FROM users WHERE email = ? AND disabled_at IS NULL").get(email) as
    | { id: number; name: string }
    | undefined;
  if (row) await sendResetEmail(email, row.name, lang, createToken(row.id, "reset"));
  // The same answer whether or not the account exists.
  return { ok: true, values: { email } };
}

export async function resetPassword(_prev: AuthState, form: FormData): Promise<AuthState> {
  const { t, lang } = await requestT();
  const limited = rateLimit("auth", await headers());
  if (limited) return { error: t(limited) };
  const password = String(form.get("password") ?? "");
  const problem = passwordProblem(password, t);
  if (problem) return { error: problem };
  if (password !== String(form.get("repeat") ?? "")) return { error: t("Passwords do not match.") };
  const token = consumeToken(String(form.get("token") ?? ""), "reset");
  if (!token) return { error: t("This reset link is invalid or has expired. Ask for a new one.") };
  // The email link proves the address, so it also counts as verification.
  db.prepare("UPDATE users SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?").run(
    await hashPassword(password),
    Date.now(),
    token.user_id,
  );
  revokeSessions(token.user_id);
  await startSession(token.user_id);
  redirect(localePath(lang, "/account?reset=1"));
}

// ---------- Signed-in account ----------

export async function changePassword(_prev: AuthState, form: FormData): Promise<AuthState> {
  const { t } = await requestT();
  const user = await currentUser();
  if (!user) return { error: t("Please log in again.") };
  const limited = rateLimit("auth", await headers(), `pw:${user.id}`);
  if (limited) return { error: t(limited) };
  const current = String(form.get("current") ?? "").slice(0, MAX_PASSWORD);
  const next = String(form.get("next") ?? "");
  const problem = passwordProblem(next, t);
  if (problem) return { error: problem };
  const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id) as { password_hash: string };
  if (!(await verifyPassword(current, row.password_hash))) return { error: t("Your current password is incorrect.") };
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await hashPassword(next), user.id);
  // Sign out every other device that knew the old password.
  revokeSessions(user.id);
  await startSession(user.id);
  await sendPasswordChanged(user.email, user.name, user.lang);
  return { ok: true };
}

export async function resendVerification(): Promise<AuthState> {
  const { t, lang } = await requestT();
  const user = await currentUser();
  if (!user) return { error: t("Please log in again.") };
  if (user.verified) return { ok: true };
  const limited = rateLimit("email", await headers(), `verify:${user.id}`);
  if (limited) return { error: t(limited) };
  await sendVerifyEmail(user.email, user.name, lang, createToken(user.id, "verify"));
  return { ok: true };
}

export async function updateProfile(_prev: AuthState, form: FormData): Promise<AuthState> {
  const { t, lang } = await requestT();
  const user = await currentUser();
  if (!user) return { error: t("Please log in again.") };
  const name = String(form.get("name") ?? "").trim().slice(0, 100);
  if (name.length < 2) return { error: t("Please enter your name.") };
  db.prepare("UPDATE users SET name = ?, lang = ? WHERE id = ?").run(name, lang, user.id);
  return { ok: true };
}

export async function changeEmail(_prev: AuthState, form: FormData): Promise<AuthState> {
  const { t, lang } = await requestT();
  const user = await currentUser();
  if (!user) return { error: t("Please log in again.") };
  const limited = rateLimit("email", await headers(), `change:${user.id}`);
  if (limited) return { error: t(limited) };
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 254);
  const password = String(form.get("password") ?? "").slice(0, MAX_PASSWORD);
  if (!EMAIL_RE.test(email)) return { error: t("Please enter a valid email address.") };
  if (email === user.email.toLowerCase()) return { error: t("This is already your email address.") };
  const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id) as { password_hash: string };
  if (!(await verifyPassword(password, row.password_hash))) return { error: t("Your current password is incorrect.") };
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
    return { error: t("An account with this email already exists.") };
  }
  await sendEmailChange(email, user.name, lang, createToken(user.id, "email-change", email));
  return { ok: true };
}

/** Deletes the account, its sessions, workflows, templates, API keys and signature requests. */
export async function deleteAccount(_prev: AuthState, form: FormData): Promise<AuthState> {
  const { t, lang } = await requestT();
  const user = await currentUser();
  if (!user) return { error: t("Please log in again.") };
  const limited = rateLimit("auth", await headers(), `delete:${user.id}`);
  if (limited) return { error: t(limited) };
  const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id) as { password_hash: string };
  if (!(await verifyPassword(String(form.get("password") ?? "").slice(0, MAX_PASSWORD), row.password_hash))) {
    return { error: t("Your current password is incorrect.") };
  }
  if (String(form.get("confirm") ?? "").trim().toUpperCase() !== "DELETE") {
    return { error: t("Type DELETE to confirm.") };
  }
  const requests = db.prepare("SELECT id FROM sign_requests WHERE owner_id = ?").all(user.id) as { id: string }[];
  db.transaction(() => {
    db.prepare("DELETE FROM sign_requests WHERE owner_id = ?").run(user.id);
    db.prepare("DELETE FROM users WHERE id = ?").run(user.id); // cascades to sessions, workflows, keys…
  });
  for (const { id } of requests) {
    const dir = requestDir(id);
    if (dir) await rm(dir, { recursive: true, force: true });
  }
  await endSession();
  await sendAccountDeleted(user.email, user.name, user.lang);
  redirect(localePath(lang, "/?deleted=1"));
}
