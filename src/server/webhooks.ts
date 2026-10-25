import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";
import { db } from "./db";
import { checkPublicUrl } from "./html-to-pdf";
import { logError } from "./monitor";
import { derive } from "./secret";

// Outgoing webhooks for the developer API and for no-code tools (Zapier,
// Make): a JSON POST signed with HMAC-SHA256, retried a few times.

export const WEBHOOK_EVENTS = [
  "task.completed",
  "task.failed",
  "signature.signed",
  "signature.completed",
  "signature.declined",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export type Webhook = { id: number; url: string; events: string; created_at: number; last_status: number | null; last_at: number | null };

/** Secret used for webhooks given per API call (`webhook_url`). */
export const userWebhookSecret = (userId: number) => `whsec_${derive(`webhook:${userId}`)}`;

export function webhooksOf(userId: number): (Webhook & { secret: string })[] {
  return db
    .prepare("SELECT id, url, events, secret, created_at, last_status, last_at FROM webhooks WHERE user_id = ? ORDER BY id")
    .all(userId) as (Webhook & { secret: string })[];
}

/** Throws a readable message when the URL is not a public http(s) address. */
export async function validateWebhookUrl(raw: string) {
  const url = await checkPublicUrl(raw).catch(() => {
    throw new Error("Use a public http or https address for the webhook.");
  });
  return url.toString();
}

export function addWebhook(userId: number, url: string, events: WebhookEvent[]) {
  const secret = `whsec_${randomBytes(24).toString("base64url")}`;
  db.prepare("INSERT INTO webhooks (user_id, url, events, secret, created_at) VALUES (?, ?, ?, ?, ?)").run(
    userId,
    url,
    events.join(","),
    secret,
    Date.now(),
  );
  return secret;
}

export function removeWebhook(userId: number, id: number) {
  db.prepare("DELETE FROM webhooks WHERE id = ? AND user_id = ?").run(id, userId);
}

export function signPayload(secret: string, timestamp: number, body: string) {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

// Addresses a webhook may never reach: this machine, private networks,
// link-local (cloud metadata), CGNAT, benchmarking, multicast and reserved.
const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 3],
] as const) blocked.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [
  ["::", 127], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8], ["2001:db8::", 32],
] as const) blocked.addSubnet(net, prefix, "ipv6");

export function isBlockedAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return blocked.check(ip, "ipv4");
  if (family !== 6) return true;
  const v = ip.toLowerCase();
  // IPv4-mapped (::ffff:a.b.c.d), IPv4-compatible and NAT64 forms embed an IPv4 address.
  const embedded = /^(?:::ffff:|::|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/.exec(v)?.[1];
  if (embedded) return isBlockedAddress(embedded);
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(v);
  if (mapped) {
    const hi = parseInt(mapped[1], 16), lo = parseInt(mapped[2], 16);
    return isBlockedAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  return blocked.check(v, "ipv6");
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/**
 * DNS lookup used for the webhook connection itself. validateWebhookUrl checks
 * the name beforehand, but the name could resolve differently by the time we
 * connect (DNS rebinding), so the addresses we actually connect to are checked
 * here too.
 */
export function publicOnlyLookup(hostname: string, options: LookupOptions, callback: LookupCallback) {
  dnsLookup(hostname, { ...options, all: true }, (err, addrs) => {
    if (err) return callback(err, []);
    if (!addrs.length || addrs.some((a) => isBlockedAddress(a.address))) {
      const e: NodeJS.ErrnoException = new Error(`Webhook host ${hostname} resolves to a private address`);
      e.code = "EPRIVATEADDR";
      return callback(e, []);
    }
    if (options.all) callback(null, addrs);
    else callback(null, addrs[0].address, addrs[0].family);
  });
}

/** One POST. Redirects are not followed; only the status code is read. */
export function postOnce(url: string, headers: Record<string, string>, body: string): Promise<number> {
  const target = new URL(url);
  // Node skips the lookup for IP literals, so check those here.
  const host = target.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && isBlockedAddress(host)) return Promise.reject(new Error("Webhook URL points at a private address"));
  const client = target.protocol === "https:" ? https : target.protocol === "http:" ? http : null;
  if (!client) return Promise.reject(new Error("Webhook URL must use http or https"));
  return new Promise((resolve, reject) => {
    const req = client.request(target, {
      method: "POST",
      lookup: publicOnlyLookup,
      agent: false,
      signal: AbortSignal.timeout(10_000),
      // node:http never decompresses; "identity" also asks the receiver not to compress.
      headers: { ...headers, "Accept-Encoding": "identity", "Content-Length": String(Buffer.byteLength(body)) },
    });
    req.on("response", (res) => {
      resolve(res.statusCode ?? 0);
      res.destroy(); // the body is never read, nor waited for
    });
    req.on("error", reject);
    req.end(body);
  });
}

async function post(url: string, secret: string, event: string, body: string): Promise<number> {
  const timestamp = Math.floor(Date.now() / 1000);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await validateWebhookUrl(url);
      const status = await postOnce(
        url,
        {
          "Content-Type": "application/json",
          "User-Agent": "Workify-Webhooks/1",
          "X-Workify-Event": event,
          "X-Workify-Timestamp": String(timestamp),
          "X-Workify-Signature": signPayload(secret, timestamp, body),
        },
        body,
      );
      if (status < 500) return status;
    } catch {
      // network error or private address: retry below
    }
    await new Promise((r) => setTimeout(r, [2_000, 15_000, 0][attempt]));
  }
  return 0;
}

/**
 * Sends `event` to the user's registered webhooks (and to `extraUrl`, the
 * webhook given with a single API call). Never throws.
 */
export async function dispatchWebhook(userId: number | null, event: WebhookEvent, data: Record<string, unknown>, extraUrl?: string | null) {
  if (!userId) return;
  const body = JSON.stringify({ event, created_at: new Date().toISOString(), data });
  const jobs: Promise<unknown>[] = [];
  for (const hook of webhooksOf(userId)) {
    if (!hook.events.split(",").includes(event)) continue;
    jobs.push(
      post(hook.url, hook.secret, event, body).then((status) =>
        db.prepare("UPDATE webhooks SET last_status = ?, last_at = ? WHERE id = ?").run(status, Date.now(), hook.id),
      ),
    );
  }
  if (extraUrl) jobs.push(post(extraUrl, userWebhookSecret(userId), event, body));
  try {
    await Promise.all(jobs);
  } catch (e) {
    logError("webhook", `Delivering ${event} failed`, e);
  }
}
