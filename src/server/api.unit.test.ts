import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";

const conn = new DatabaseSync(":memory:");
conn.exec(`
  CREATE TABLE api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, last_used_at INTEGER, revoked_at INTEGER
  );
  CREATE TABLE api_tasks (
    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, tool TEXT NOT NULL, status TEXT NOT NULL, result TEXT,
    error TEXT, webhook_url TEXT, created_at INTEGER NOT NULL, finished_at INTEGER
  );
`);

const users = new Map<number, { id: number; name: string; email: string }>([
  [1, { id: 1, name: "Asha", email: "asha@example.com" }],
  [2, { id: 2, name: "Ben", email: "ben@example.com" }],
]);
let limited: string | null = null;
const rateLimitCalls: unknown[][] = [];

vi.mock("./db", () => ({ db: { prepare: (sql: string) => conn.prepare(sql) } }));
vi.mock("./auth", async () => {
  const { randomBytes } = await import("node:crypto");
  return {
    newToken: (bytes = 32) => randomBytes(bytes).toString("base64url"),
    tokenHash: (t: string) => createHash("sha256").update(t).digest("hex"),
    userById: (id: number) => users.get(id) ?? null,
  };
});
vi.mock("./rate-limit", () => ({
  rateLimit: (...args: unknown[]) => {
    rateLimitCalls.push(args);
    return limited;
  },
}));
vi.mock("./run-task", () => ({ runTask: vi.fn(), TaskError: class extends Error {} }));
vi.mock("./webhooks", () => ({ dispatchWebhook: vi.fn() }));

const api = await import("./api");
const { SITE_URL } = await import("@/lib/site");

const req = (authorization?: string) =>
  new Request("http://localhost/api/v1/tasks", { headers: authorization === undefined ? {} : { authorization } });

function apiErrorOf(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(api.ApiError);
    return e as InstanceType<typeof api.ApiError>;
  }
  throw new Error("expected an ApiError");
}

beforeEach(() => {
  conn.exec("DELETE FROM api_keys; DELETE FROM api_tasks;");
  limited = null;
  rateLimitCalls.length = 0;
});

describe("createApiKey", () => {
  it("returns a wfy_ key once and stores only its hash and a short prefix", () => {
    const key = api.createApiKey(1, "CI");
    expect(key).toMatch(/^wfy_[A-Za-z0-9_-]{40}$/);
    const row = conn.prepare("SELECT * FROM api_keys").get() as Record<string, unknown>;
    expect(row.prefix).toBe(key.slice(0, 12));
    expect(row.key_hash).toBe(createHash("sha256").update(key).digest("hex"));
    expect(JSON.stringify(row)).not.toContain(key);
  });

  it("makes a different key every time", () => {
    const keys = new Set(Array.from({ length: 50 }, () => api.createApiKey(1, "k")));
    expect(keys.size).toBe(50);
  });
});

describe("apiKeysOf / revokeApiKey", () => {
  it("lists only the user's active keys, without hashes", () => {
    api.createApiKey(1, "one");
    api.createApiKey(1, "two");
    api.createApiKey(2, "other");
    const keys = api.apiKeysOf(1);
    expect(keys.map((k) => k.name)).toEqual(["one", "two"]);
    expect(keys[0]).not.toHaveProperty("key_hash");
  });

  it("only lets the owner revoke a key", () => {
    api.createApiKey(1, "one");
    const id = api.apiKeysOf(1)[0].id;
    api.revokeApiKey(2, id);
    expect(api.apiKeysOf(1)).toHaveLength(1);
    api.revokeApiKey(1, id);
    expect(api.apiKeysOf(1)).toHaveLength(0);
  });
});

describe("authenticate", () => {
  it("returns the key's user, records the use and rate limits per key", () => {
    const key = api.createApiKey(2, "k");
    expect(api.authenticate(req(`Bearer ${key}`))).toEqual(users.get(2));
    const row = conn.prepare("SELECT id, last_used_at FROM api_keys").get() as { id: number; last_used_at: number | null };
    expect(row.last_used_at).toBeTypeOf("number");
    expect(rateLimitCalls).toHaveLength(1);
    expect(rateLimitCalls[0][0]).toBe("api");
    expect(rateLimitCalls[0][2]).toBe(`key:${row.id}`);
  });

  it("tolerates surrounding whitespace and several spaces after Bearer", () => {
    const key = api.createApiKey(1, "k");
    expect(api.authenticate(req(`  Bearer    ${key}  `)).id).toBe(1);
  });

  it.each([
    [undefined],
    [""],
    ["wfy_abcdefghijklmnopqrstuvwxyz"],
    ["Basic d2Z5Og=="],
    ["Bearer"],
    ["Bearer wfy_short"],
    [`Bearer wfy_${"a".repeat(81)}`],
    ["Bearer sk_abcdefghijklmnopqrstuvwxyz"],
    ["Bearer wfy_abcdefghijklmnopqrstuvwxyz extra"],
    ["Bearer wfy_abcdefghij'or'1'='1abcdefgh"],
  ])("refuses a malformed header %j with 401 before touching the database", (h) => {
    const e = apiErrorOf(() => api.authenticate(req(h)));
    expect(e.status).toBe(401);
    expect(e.message).toMatch(/Authorization: Bearer/);
    expect(rateLimitCalls).toHaveLength(0);
  });

  it("refuses unknown and revoked keys", () => {
    const key = api.createApiKey(1, "k");
    expect(apiErrorOf(() => api.authenticate(req(`Bearer wfy_${"x".repeat(40)}`))).status).toBe(401);
    api.revokeApiKey(1, api.apiKeysOf(1)[0].id);
    const e = apiErrorOf(() => api.authenticate(req(`Bearer ${key}`)));
    expect(e.status).toBe(401);
    expect(e.message).toMatch(/invalid or has been revoked/);
  });

  it("refuses keys of deleted users", () => {
    const key = api.createApiKey(99, "orphan");
    expect(apiErrorOf(() => api.authenticate(req(`Bearer ${key}`))).status).toBe(401);
  });

  it("answers 429 when the key is rate limited, without recording a use", () => {
    const key = api.createApiKey(1, "k");
    limited = "Too many requests.";
    const e = apiErrorOf(() => api.authenticate(req(`Bearer ${key}`)));
    expect(e.status).toBe(429);
    expect(e.message).toBe("Too many requests.");
    expect((conn.prepare("SELECT last_used_at FROM api_keys").get() as { last_used_at: number | null }).last_used_at).toBeNull();
  });

  // BUG(api-bearer-case): expected the auth scheme to be case-insensitive
  // (RFC 7235 section 2.1 / RFC 6750), so "bearer wfy_..." works like
  // "Bearer wfy_..."; actual: the regex only accepts "Bearer" and answers 401.
  it("accepts the Bearer scheme in any case", () => {
    const key = api.createApiKey(1, "k");
    expect(api.authenticate(req(`bearer ${key}`)).id).toBe(1);
    expect(api.authenticate(req(`BEARER ${key}`)).id).toBe(1);
  });
});

describe("publicResult / taskJson / taskOf", () => {
  it("turns result paths into absolute download links with an expiry about an hour away", () => {
    const before = Date.now();
    const r = api.publicResult({ fileName: "a.pdf", size: 10, inputSize: 20, count: 1, downloadUrl: "/api/download/x/a.pdf" } as never);
    expect(r).toMatchObject({ file_name: "a.pdf", size: 10, input_size: 20, file_count: 1, download_url: `${SITE_URL}/api/download/x/a.pdf` });
    const exp = Date.parse(r.expires_at);
    expect(exp - before).toBeGreaterThanOrEqual(60 * 60_000 - 1000);
    expect(exp - before).toBeLessThanOrEqual(60 * 60_000 + 1000);
  });

  it("formats tasks with ISO dates and parsed results", () => {
    const t = {
      id: "task_1",
      tool: "merge-pdf",
      status: "done" as const,
      result: JSON.stringify({ file_name: "m.pdf" }),
      error: null,
      created_at: Date.UTC(2026, 0, 1),
      finished_at: null,
    };
    expect(api.taskJson(t)).toEqual({
      id: "task_1",
      tool: "merge-pdf",
      status: "done",
      result: { file_name: "m.pdf" },
      error: null,
      created_at: "2026-01-01T00:00:00.000Z",
      finished_at: null,
    });
  });

  it("only shows a task to its owner", () => {
    conn.prepare("INSERT INTO api_tasks (id, user_id, tool, status, created_at) VALUES ('task_a', 1, 'merge-pdf', 'queued', 1)").run();
    expect(api.taskOf(1, "task_a")?.tool).toBe("merge-pdf");
    expect(api.taskOf(2, "task_a")).toBeNull();
    expect(api.taskOf(1, "task_missing")).toBeNull();
    expect(api.taskOf(1, "' OR 1=1 --")).toBeNull();
  });

  it("deletes task records older than a week", () => {
    const now = Date.now();
    conn.prepare("INSERT INTO api_tasks (id, user_id, tool, status, created_at) VALUES ('old', 1, 't', 'done', ?), ('new', 1, 't', 'done', ?)").run(
      now - 8 * 86_400_000,
      now - 6 * 86_400_000,
    );
    api.sweepApiTasks();
    expect((conn.prepare("SELECT id FROM api_tasks").all() as { id: string }[]).map((r) => r.id)).toEqual(["new"]);
  });
});

describe("apiError", () => {
  it("answers JSON with the status and no caching", async () => {
    const res = api.apiError(404, "Not found");
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ error: { status: 404, message: "Not found" } });
  });
});
