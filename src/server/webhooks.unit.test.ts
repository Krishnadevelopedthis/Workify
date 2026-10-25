import { createHmac, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const conn = new DatabaseSync(":memory:");
conn.exec(`
  CREATE TABLE webhooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, url TEXT NOT NULL, events TEXT NOT NULL,
    secret TEXT NOT NULL, created_at INTEGER NOT NULL, last_status INTEGER, last_at INTEGER
  );
`);

const checkPublicUrl = vi.fn(async (raw: string): Promise<URL> => {
  throw new Error(`blocked ${raw}`);
});
const logError = vi.fn();

vi.mock("./db", () => ({ db: { prepare: (sql: string) => conn.prepare(sql) } }));
vi.mock("./monitor", () => ({ logError: (...a: unknown[]) => logError(...a) }));
vi.mock("./secret", () => ({ derive: (label: string) => createHmac("sha256", "test-key").update(label).digest("base64url") }));
vi.mock("./html-to-pdf", () => ({ checkPublicUrl: (raw: string) => checkPublicUrl(raw) }));

const wh = await import("./webhooks");

/** What a receiver does: recompute the HMAC over "<timestamp>.<raw body>" and compare in constant time. */
function receiverAccepts(secret: string, timestamp: number, body: string, header: string) {
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`);
  const got = Buffer.from(header);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

beforeEach(() => {
  conn.exec("DELETE FROM webhooks; DELETE FROM sqlite_sequence;");
  checkPublicUrl.mockClear();
  logError.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("signPayload", () => {
  it("is a hex HMAC-SHA256 of '<timestamp>.<body>' with a sha256= prefix", () => {
    const sig = wh.signPayload("whsec_abc", 1_700_000_000, '{"a":1}');
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(receiverAccepts("whsec_abc", 1_700_000_000, '{"a":1}', sig)).toBe(true);
  });

  it("changes with the secret, the timestamp and every byte of the body", () => {
    const sig = wh.signPayload("s", 1, "body");
    expect(wh.signPayload("s2", 1, "body")).not.toBe(sig);
    expect(wh.signPayload("s", 2, "body")).not.toBe(sig);
    expect(wh.signPayload("s", 1, "body ")).not.toBe(sig);
    expect(receiverAccepts("s", 1, "Body", sig)).toBe(false);
  });

  it("binds the timestamp to the body, so they cannot be shifted into each other", () => {
    // "1.2" + "." + "x" vs "1" + "." + "2.x" would collide if the separator were ambiguous;
    // the timestamp is an integer, so a dot can only be the separator.
    expect(wh.signPayload("s", 12, "x")).not.toBe(wh.signPayload("s", 1, "2.x"));
  });

  it("signs unicode bodies as UTF-8", () => {
    const body = JSON.stringify({ file: "रिपोर्ट 😀.pdf" });
    const expected = `sha256=${createHmac("sha256", "s").update(Buffer.from(`5.${body}`, "utf8")).digest("hex")}`;
    expect(wh.signPayload("s", 5, body)).toBe(expected);
  });

  it("signs empty bodies", () => {
    expect(wh.signPayload("s", 0, "")).toMatch(/^sha256=[0-9a-f]{64}$/);
  });
});

describe("userWebhookSecret", () => {
  it("is stable per user and different between users", () => {
    expect(wh.userWebhookSecret(1)).toBe(wh.userWebhookSecret(1));
    expect(wh.userWebhookSecret(1)).not.toBe(wh.userWebhookSecret(2));
    expect(wh.userWebhookSecret(1)).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
  });
});

describe("WEBHOOK_EVENTS", () => {
  it("are unique and contain no commas (they are stored comma-separated)", () => {
    expect(new Set(wh.WEBHOOK_EVENTS).size).toBe(wh.WEBHOOK_EVENTS.length);
    for (const e of wh.WEBHOOK_EVENTS) expect(e).toMatch(/^[a-z]+\.[a-z]+$/);
  });
});

describe("validateWebhookUrl", () => {
  it("returns the normalised URL of a public address", async () => {
    checkPublicUrl.mockResolvedValueOnce(new URL("https://hooks.example.com/a b"));
    await expect(wh.validateWebhookUrl("https://hooks.example.com/a b")).resolves.toBe("https://hooks.example.com/a%20b");
  });

  it("turns every refusal into one readable message", async () => {
    await expect(wh.validateWebhookUrl("http://127.0.0.1/")).rejects.toThrow("Use a public http or https address for the webhook.");
  });
});

describe("addWebhook / webhooksOf / removeWebhook", () => {
  it("stores a fresh secret per webhook and lists only the user's own", () => {
    const s1 = wh.addWebhook(1, "https://a.example/h", ["task.completed", "task.failed"]);
    const s2 = wh.addWebhook(1, "https://b.example/h", ["signature.signed"]);
    wh.addWebhook(2, "https://c.example/h", ["task.completed"]);
    expect(s1).toMatch(/^whsec_[A-Za-z0-9_-]{32}$/);
    expect(s1).not.toBe(s2);
    const mine = wh.webhooksOf(1);
    expect(mine.map((h) => h.url)).toEqual(["https://a.example/h", "https://b.example/h"]);
    expect(mine[0].events).toBe("task.completed,task.failed");
    expect(mine[0].secret).toBe(s1);
  });

  it("only lets the owner remove a webhook", () => {
    wh.addWebhook(1, "https://a.example/h", ["task.completed"]);
    const id = wh.webhooksOf(1)[0].id;
    wh.removeWebhook(2, id);
    expect(wh.webhooksOf(1)).toHaveLength(1);
    wh.removeWebhook(1, id);
    expect(wh.webhooksOf(1)).toHaveLength(0);
  });
});

describe("dispatchWebhook", () => {
  it("does nothing for anonymous runs", async () => {
    await wh.dispatchWebhook(null, "task.completed", {}, "https://x.example/");
    expect(checkPublicUrl).not.toHaveBeenCalled();
  });

  it("skips webhooks that did not subscribe to the event (exact names, not prefixes)", async () => {
    wh.addWebhook(1, "https://a.example/h", ["task.failed", "signature.completed"]);
    await wh.dispatchWebhook(1, "task.completed", {});
    await wh.dispatchWebhook(1, "signature.signed", {});
    expect(checkPublicUrl).not.toHaveBeenCalled();
    expect(wh.webhooksOf(1)[0].last_status).toBeNull();
  });

  it("retries a refused address three times, then records status 0 without throwing", async () => {
    vi.useFakeTimers();
    wh.addWebhook(1, "http://10.0.0.1/h", ["task.completed"]);
    const done = wh.dispatchWebhook(1, "task.completed", { task_id: "t" });
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(done).resolves.toBeUndefined();
    expect(checkPublicUrl).toHaveBeenCalledTimes(3);
    const [hook] = wh.webhooksOf(1);
    expect(hook.last_status).toBe(0);
    expect(hook.last_at).toBeTypeOf("number");
  });

  it("also delivers to the per-call webhook URL, re-checking it every attempt", async () => {
    vi.useFakeTimers();
    const done = wh.dispatchWebhook(3, "task.failed", {}, "http://169.254.169.254/latest/meta-data");
    await vi.advanceTimersByTimeAsync(20_000);
    await done;
    expect(checkPublicUrl.mock.calls.map((c) => c[0])).toEqual(Array(3).fill("http://169.254.169.254/latest/meta-data"));
  });
});
