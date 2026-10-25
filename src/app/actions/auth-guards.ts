import "server-only";
import { splitLocale } from "@/i18n/config";

// Helpers for the auth server actions. They live outside auth.ts because a
// "use server" module may only export async actions.

const BASE = "http://workify.invalid";

/**
 * Only allow redirects to a path on this site. Parsing as a URL catches tricks
 * like "//evil.com" and "/\evil.com", which browsers treat as other hosts. The
 * value returned (after the locale prefix is removed) is checked again, so
 * "/hi//evil.com" or "/.//evil.com" cannot turn into "//evil.com".
 */
export function safeNext(raw: unknown): string {
  const next = String(raw ?? "/");
  try {
    if (!next.startsWith("/")) return "/";
    const url = new URL(next, BASE);
    if (url.origin !== BASE) return "/";
    const path = splitLocale(url.pathname)[1];
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return "/";
    const result = path + url.search + url.hash;
    return new URL(result, BASE).origin === BASE ? result : "/";
  } catch {
    return "/";
  }
}

// In-memory counters for limits that must count only some events (a failed
// login, an email actually sent), which rateLimit() cannot do because it
// records every call.
const g = globalThis as unknown as { workifyAuthCounters?: Map<string, number[]> };
const counters: Map<string, number[]> = (g.workifyAuthCounters ??= new Map<string, number[]>());
const KEEP_MS = 86_400_000; // longest window used below

setInterval(() => {
  const now = Date.now();
  for (const [k, hits] of counters) if (!hits.some((t) => now - t < KEEP_MS)) counters.delete(k);
}, 600_000).unref();

/** True when `key` already has `limit` or more events in the last `windowMs`. */
export function overLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (counters.get(key) ?? []).filter((t) => now - t < Math.min(windowMs, KEEP_MS));
  if (hits.length) counters.set(key, hits);
  else counters.delete(key);
  return hits.length >= limit;
}

/** Records one event for `key`. */
export function record(key: string) {
  const hits = counters.get(key) ?? [];
  hits.push(Date.now());
  counters.set(key, hits);
}

/** Takes back the most recent event recorded for `key`. */
export function unrecord(key: string) {
  const hits = counters.get(key);
  if (!hits) return;
  hits.pop();
  if (!hits.length) counters.delete(key);
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Failed logins allowed per (email, client) and per email, per 15 minutes. */
export const LOGIN_WINDOW = 15 * MINUTE;
export const LOGIN_FAILS_PER_CLIENT = 10;
export const LOGIN_FAILS_PER_EMAIL = 100;
/** Reset emails actually sent to one address per hour, and the gap before a new link replaces the last one. */
export const RESET_EMAILS_PER_HOUR = 3;
export const RESET_REUSE_MS = 5 * MINUTE;
/** Verification emails re-sent per account per day. */
export const VERIFY_RESENDS_PER_DAY = 3;

// Already translated in every locale (it is also a rateLimit() message).
export const TOO_MANY_ATTEMPTS = "Too many attempts. Please wait a few minutes and try again.";
