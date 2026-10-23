import "server-only";
import { newToken, revokeSessions, tokenHash } from "./auth";
import { db } from "./db";

// Single-use links sent by email: confirm an address, reset a password,
// or confirm a new address.
export type TokenPurpose = "verify" | "reset" | "email-change";

export const TOKEN_TTL: Record<TokenPurpose, number> = {
  verify: 7 * 86_400_000,
  reset: 60 * 60_000,
  "email-change": 24 * 60 * 60_000,
};

/** Creates a token, replacing earlier ones of the same purpose for this user. */
export function createToken(userId: number, purpose: TokenPurpose, data?: string) {
  const token = newToken();
  db.transaction(() => {
    db.prepare("DELETE FROM auth_tokens WHERE (user_id = ? AND purpose = ?) OR expires_at < ?").run(userId, purpose, Date.now());
    db.prepare("INSERT INTO auth_tokens (token_hash, user_id, purpose, data, expires_at) VALUES (?, ?, ?, ?, ?)").run(
      tokenHash(token),
      userId,
      purpose,
      data ?? null,
      Date.now() + TOKEN_TTL[purpose],
    );
  });
  return token;
}

type TokenRow = { user_id: number; data: string | null };

/** The token's user (and data) if it is valid, without using it up. */
export function peekToken(token: string, purpose: TokenPurpose): TokenRow | null {
  if (!token || token.length > 100) return null;
  return (
    (db
      .prepare("SELECT user_id, data FROM auth_tokens WHERE token_hash = ? AND purpose = ? AND expires_at > ?")
      .get(tokenHash(token), purpose, Date.now()) as TokenRow | undefined) ?? null
  );
}

/**
 * Confirms an address from an emailed link: the account's own address, or
 * (`change`) the new address it asked for. Returns false for invalid links.
 */
export function confirmEmail(token: string, change: boolean): boolean {
  const row = consumeToken(token, change ? "email-change" : "verify");
  if (!row) return false;
  if (!change) {
    db.prepare("UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?").run(Date.now(), row.user_id);
    return true;
  }
  const taken = db.prepare("SELECT 1 FROM users WHERE email = ? AND id != ?").get(row.data ?? "", row.user_id);
  if (taken || !row.data) return false;
  db.prepare("UPDATE users SET email = ?, email_verified_at = ? WHERE id = ?").run(row.data, Date.now(), row.user_id);
  revokeSessions(row.user_id); // sign in again with the new address
  return true;
}

/** Validates and deletes the token. */
export function consumeToken(token: string, purpose: TokenPurpose): TokenRow | null {
  const row = peekToken(token, purpose);
  if (row) db.prepare("DELETE FROM auth_tokens WHERE token_hash = ?").run(tokenHash(token));
  return row;
}
