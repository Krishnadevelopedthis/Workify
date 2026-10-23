import "server-only";
import { createHmac, randomBytes } from "node:crypto";
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

async function post(url: string, secret: string, event: string, body: string): Promise<number> {
  const timestamp = Math.floor(Date.now() / 1000);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await validateWebhookUrl(url); // re-checked each time: DNS may change
      const res = await fetch(url, {
        method: "POST",
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Workify-Webhooks/1",
          "X-Workify-Event": event,
          "X-Workify-Timestamp": String(timestamp),
          "X-Workify-Signature": signPayload(secret, timestamp, body),
        },
        body,
      });
      if (res.status < 500) return res.status;
    } catch {
      // network error: retry below
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
