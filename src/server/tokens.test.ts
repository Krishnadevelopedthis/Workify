import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";

// An in-memory stand-in for the app database with just the tables used here.
const conn = new DatabaseSync(":memory:");
conn.exec(`
  CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, email_verified_at INTEGER);
  CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL);
  CREATE TABLE auth_tokens (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, purpose TEXT NOT NULL, data TEXT, expires_at INTEGER NOT NULL);
`);

vi.mock("./db", () => ({
  db: {
    prepare: (sql: string) => conn.prepare(sql),
    transaction<T>(fn: () => T): T {
      conn.exec("BEGIN");
      try {
        const result = fn();
        conn.exec("COMMIT");
        return result;
      } catch (e) {
        conn.exec("ROLLBACK");
        throw e;
      }
    },
  },
}));

let counter = 0;
vi.mock("./auth", () => ({
  newToken: () => `token-${++counter}`,
  tokenHash: (token: string) => createHash("sha256").update(token).digest("hex"),
  revokeSessions: (userId: number) => conn.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId),
}));

const { confirmEmail, createToken, peekToken, revokeTokens } = await import("./tokens");

beforeEach(() => {
  conn.exec("DELETE FROM users; DELETE FROM sessions; DELETE FROM auth_tokens;");
  conn.prepare("INSERT INTO users (id, email) VALUES (1, 'old@example.com'), (2, 'other@example.com')").run();
});

describe("confirmEmail", () => {
  it("invalidates a reset link sent to the old address once the address changes", () => {
    const reset = createToken(1, "reset");
    const otherReset = createToken(2, "reset");
    const change = createToken(1, "email-change", "new@example.com");

    expect(confirmEmail(change, true)).toBe(true);
    expect(conn.prepare("SELECT email FROM users WHERE id = 1").get()).toEqual({ email: "new@example.com" });
    expect(peekToken(reset, "reset")).toBeNull();
    // Other accounts keep their links.
    expect(peekToken(otherReset, "reset")).not.toBeNull();
  });

  it("keeps outstanding links when only verifying the current address", () => {
    const reset = createToken(1, "reset");
    const verify = createToken(1, "verify");
    expect(confirmEmail(verify, false)).toBe(true);
    expect(peekToken(reset, "reset")).not.toBeNull();
  });

  it("leaves links alone when the new address is already taken", () => {
    const reset = createToken(1, "reset");
    const change = createToken(1, "email-change", "other@example.com");
    expect(confirmEmail(change, true)).toBe(false);
    expect(peekToken(reset, "reset")).not.toBeNull();
  });
});

describe("revokeTokens", () => {
  it("invalidates every outstanding link of the user only", () => {
    const reset = createToken(1, "reset");
    const verify = createToken(1, "verify");
    const change = createToken(1, "email-change", "new@example.com");
    const otherReset = createToken(2, "reset");
    revokeTokens(1);
    expect(peekToken(reset, "reset")).toBeNull();
    expect(peekToken(verify, "verify")).toBeNull();
    expect(peekToken(change, "email-change")).toBeNull();
    expect(peekToken(otherReset, "reset")).not.toBeNull();
  });
});

describe("createToken", () => {
  it("keeps earlier reset links valid, so a forged request cannot void the owner's link", () => {
    const first = createToken(1, "reset");
    const second = createToken(1, "reset");
    expect(peekToken(first, "reset")).not.toBeNull();
    expect(peekToken(second, "reset")).not.toBeNull();
  });

  it("replaces earlier links of the other purposes", () => {
    const first = createToken(1, "verify");
    const second = createToken(1, "verify");
    expect(peekToken(first, "verify")).toBeNull();
    expect(peekToken(second, "verify")).not.toBeNull();
  });
});
