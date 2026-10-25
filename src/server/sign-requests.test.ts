import { createHash } from "node:crypto";
import { rmSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// An in-memory stand-in for the app database with the signing tables, and a
// temporary data folder for the stored PDFs.
const h = await vi.hoisted(async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const { mkdtempSync: mk } = await import("node:fs");
  const { tmpdir: tmp } = await import("node:os");
  const p = await import("node:path");
  const conn = new DatabaseSync(":memory:");
  conn.exec(`
    CREATE TABLE sign_requests (
      id TEXT PRIMARY KEY, owner_id INTEGER, manage_hash TEXT NOT NULL UNIQUE, file_name TEXT NOT NULL,
      sender_name TEXT NOT NULL, sender_email TEXT, message TEXT NOT NULL, ordered INTEGER NOT NULL,
      reminder_days INTEGER NOT NULL, status TEXT NOT NULL, lang TEXT NOT NULL, document_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, completed_at INTEGER
    );
    CREATE TABLE signers (
      id INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT NOT NULL REFERENCES sign_requests(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE, token_enc TEXT, position INTEGER NOT NULL, name TEXT NOT NULL, email TEXT,
      status TEXT NOT NULL, notified_at INTEGER, reminded_at INTEGER, viewed_at INTEGER, signed_at INTEGER, decline_reason TEXT
    );
    CREATE TABLE sign_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT NOT NULL REFERENCES sign_requests(id) ON DELETE CASCADE,
      signer_id INTEGER, event TEXT NOT NULL, at INTEGER NOT NULL, ip TEXT, user_agent TEXT, detail TEXT
    );
    PRAGMA foreign_keys = ON;
  `);
  return { conn, dataDir: mk(p.join(tmp(), "workify-sign-")) };
});

vi.mock("./db", () => ({
  DATA_DIR: h.dataDir,
  db: {
    prepare: (sql: string) => h.conn.prepare(sql),
    transaction<T>(fn: () => T): T {
      h.conn.exec("BEGIN");
      try {
        const result = fn();
        h.conn.exec("COMMIT");
        return result;
      } catch (e) {
        h.conn.exec("ROLLBACK");
        throw e;
      }
    },
  },
}));
vi.mock("./auth", () => ({ tokenHash: (t: string) => createHash("sha256").update(t).digest("hex") }));
vi.mock("./secret", () => ({ seal: (s: string) => s, unseal: (s: string) => s }));
vi.mock("./emails", () => ({
  sendSignCancelled: vi.fn(),
  sendSignCompleted: vi.fn(),
  sendSignDeclined: vi.fn(),
  sendSignInvite: vi.fn(),
  sendSignProgress: vi.fn(),
}));
vi.mock("./monitor", () => ({ logError: vi.fn() }));
vi.mock("./engines", () => ({ ToolError: class extends Error {} }));
vi.mock("./pdf-helpers", () => ({ drawableText: (_f: unknown, s: string) => s }));
vi.mock("./pdf-sign", () => ({ certificateInfo: vi.fn(), sealPdf: vi.fn() }));
vi.mock("./webhooks", () => ({ dispatchWebhook: vi.fn() }));
vi.mock("./sign-input", () => ({ inviteLimitError: (max: number) => new Error(`invite limit ${max}`) }));

const sr = await import("./sign-requests");

const KB = 1024;
const newRequest = (ip: string, bytes = 10 * KB, ownerId: number | null = null) =>
  sr.createRequest({
    ownerId,
    senderName: "Sender",
    senderEmail: null,
    fileName: "a.pdf",
    message: "",
    ordered: false,
    reminderDays: 0,
    lang: "en",
    signers: [{ name: "A", email: null }],
    bytes: new Uint8Array(bytes),
    client: { ip, userAgent: null },
  });

const ENV = {
  WORKIFY_ANON_SIGN_PER_IP_DAY: "3",
  WORKIFY_ANON_SIGN_PER_DAY: "5",
  WORKIFY_ANON_SIGN_IP_MB: "1",
  WORKIFY_ANON_SIGN_STORAGE_MB: "2",
};

beforeEach(() => {
  h.conn.exec("DELETE FROM sign_events; DELETE FROM signers; DELETE FROM sign_requests;");
  Object.assign(process.env, ENV);
});

afterAll(() => {
  for (const k of Object.keys(ENV)) delete process.env[k];
  rmSync(h.dataDir, { recursive: true, force: true });
});

const limitKind = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return e instanceof sr.AnonymousLimitError ? e.kind : String(e);
  }
};

describe("anonymous signature requests", () => {
  // BUG(R2-2): anonymous requests had no cap besides the hourly rate limit.
  it("caps how many requests one IP creates per day, without affecting others or accounts", async () => {
    for (let i = 0; i < 3; i++) await newRequest("198.51.100.7");
    expect(await limitKind(newRequest("198.51.100.7"))).toBe("client");
    expect(await limitKind(newRequest("198.51.100.8"))).toBeNull();
    expect(await limitKind(newRequest("198.51.100.7", 10 * KB, 42))).toBeNull();
  });

  // BUG(R2-2): one IPv6 user holds a whole /64, so all of it shares the cap.
  it("counts an IPv6 /64 as one client", async () => {
    for (let i = 1; i <= 3; i++) await newRequest(`2001:db8:1:2::${i}`);
    expect(await limitKind(newRequest("2001:db8:1:2::99"))).toBe("client");
  });

  // BUG(R2-2): many IPs together could create any number of requests.
  it("caps anonymous requests per day across all IPs", async () => {
    for (let i = 1; i <= 5; i++) await newRequest(`203.0.113.${i}`);
    expect(await limitKind(newRequest("203.0.113.50"))).toBe("global");
    expect(await limitKind(newRequest("203.0.113.50", 10 * KB, 42))).toBeNull();
  });

  // BUG(R2-2): no cap on the bytes one IP keeps on disk.
  it("caps the bytes one IP keeps stored", async () => {
    await newRequest("192.0.2.1", 300 * KB); // counted as original + current + final
    expect(await limitKind(newRequest("192.0.2.1", 100 * KB))).toBe("client");
    expect(await limitKind(newRequest("192.0.2.2", 100 * KB))).toBeNull();
  });

  // BUG(R2-2): no cap on the bytes all anonymous requests keep on disk.
  it("caps the bytes all anonymous requests keep stored", async () => {
    process.env.WORKIFY_ANON_SIGN_IP_MB = "100";
    await newRequest("192.0.2.10", 600 * KB);
    expect(await limitKind(newRequest("192.0.2.11", 100 * KB))).toBe("global");
    expect(await limitKind(newRequest("192.0.2.11", 10 * KB, 42))).toBeNull();
  });

  // BUG(R2-2): anonymous uploads could be as large as an account's.
  it("refuses anonymous files over the smaller size limit", async () => {
    process.env.WORKIFY_ANON_SIGN_IP_MB = "1000";
    process.env.WORKIFY_ANON_SIGN_STORAGE_MB = "1000";
    expect(await limitKind(newRequest("192.0.2.20", sr.ANON_MAX_BYTES + 1))).toBe("size");
    expect(await limitKind(newRequest("192.0.2.20", sr.ANON_MAX_BYTES + 1, 42))).toBeNull();
  });

  // BUG(R2-2): anonymous requests nobody opened were kept for 30 days.
  it("keeps anonymous requests nobody opened only briefly, and the full time once opened", async () => {
    const created = await newRequest("192.0.2.30");
    const request = sr.getRequest(created.id)!;
    expect(request.expires_at - request.created_at).toBe(sr.ANON_UNOPENED_TTL_MS);
    expect(sr.ANON_UNOPENED_TTL_MS).toBeLessThan(sr.SIGN_TTL_MS);
    sr.markViewed(request, sr.signersOf(request.id)[0], { ip: "192.0.2.31", userAgent: null });
    const opened = sr.getRequest(created.id)!;
    expect(opened.expires_at - opened.created_at).toBe(sr.SIGN_TTL_MS);

    const owned = sr.getRequest((await newRequest("192.0.2.30", 10 * KB, 42)).id)!;
    expect(owned.expires_at - owned.created_at).toBe(sr.SIGN_TTL_MS);
  });

  it("stores the files under the data folder", async () => {
    const created = await newRequest("192.0.2.40");
    expect(sr.requestDir(created.id)).toBe(path.join(h.dataDir, "signatures", created.id));
  });
});

