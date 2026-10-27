// One place for the checks every form shares, so the sign-up, contact, waitlist
// and signing forms cannot drift apart.

/**
 * A practical email check: one "@", no whitespace or control characters, a
 * local part of at most 64 characters, no empty domain labels ("a@b..com",
 * "a@.com") and a top-level domain of at least two characters.
 */
const EMAIL_RE = /^[^\s@\p{Cc}]{1,64}@[^\s@\p{Cc}.]+(\.[^\s@\p{Cc}.]+)*\.[^\s@\p{Cc}.]{2,}$/u;

export const MAX_EMAIL = 254;

export function isEmail(value: string): boolean {
  return value.length <= MAX_EMAIL && EMAIL_RE.test(value);
}

/** A trimmed, lower-case address ready to store or compare. */
export function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().slice(0, MAX_EMAIL);
}

/**
 * Single-line text (names, subjects): control characters and line or paragraph
 * separators become one space, so a name can never break an email header or the
 * audit trail.
 */
export function cleanLine(value: unknown, max: number): string {
  return String(value ?? "").replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, " ").trim().slice(0, max);
}

/** Multi-line text (messages): line breaks and tabs stay, other control characters go. */
export function cleanText(value: unknown, max: number): string {
  return String(value ?? "").replace(/\r\n?/g, "\n").replace(/[^\P{Cc}\n\t]/gu, "").trim().slice(0, max);
}
