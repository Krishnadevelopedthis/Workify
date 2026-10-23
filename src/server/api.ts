import "server-only";
import { randomUUID } from "node:crypto";
import { SITE_URL } from "@/lib/site";
import { newToken, tokenHash, userById, type User } from "./auth";
import { db } from "./db";
import { rateLimit } from "./rate-limit";
import { runTask, TaskError, type TaskInput, type TaskResult } from "./run-task";
import { dispatchWebhook } from "./webhooks";

// Developer API: personal API keys (only a hash is stored), and tasks that
// run in the background and report back by webhook.

export const MAX_KEYS = 10;

export type ApiKey = { id: number; name: string; prefix: string; created_at: number; last_used_at: number | null };

export function createApiKey(userId: number, name: string): string {
  const key = `wfy_${newToken(30)}`;
  db.prepare("INSERT INTO api_keys (user_id, name, prefix, key_hash, created_at) VALUES (?, ?, ?, ?, ?)").run(
    userId,
    name,
    key.slice(0, 12),
    tokenHash(key),
    Date.now(),
  );
  return key;
}

export function apiKeysOf(userId: number): ApiKey[] {
  return db
    .prepare("SELECT id, name, prefix, created_at, last_used_at FROM api_keys WHERE user_id = ? AND revoked_at IS NULL ORDER BY id")
    .all(userId) as ApiKey[];
}

export function revokeApiKey(userId: number, id: number) {
  db.prepare("UPDATE api_keys SET revoked_at = ? WHERE id = ? AND user_id = ?").run(Date.now(), id, userId);
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly vars?: Record<string, string | number>,
  ) {
    super(message);
  }
}

/** The user behind the request's API key. Throws ApiError (401/429). */
export function authenticate(request: Request): User {
  const header = request.headers.get("authorization") ?? "";
  const key = /^Bearer\s+(wfy_[A-Za-z0-9_-]{20,80})$/.exec(header.trim())?.[1];
  if (!key) throw new ApiError(401, "Send your API key as: Authorization: Bearer wfy_...");
  const row = db
    .prepare("SELECT id, user_id FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL")
    .get(tokenHash(key)) as { id: number; user_id: number } | undefined;
  const user = row && userById(row.user_id);
  if (!row || !user) throw new ApiError(401, "This API key is invalid or has been revoked.");
  const limited = rateLimit("api", request.headers, `key:${row.id}`);
  if (limited) throw new ApiError(429, limited);
  db.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").run(Date.now(), row.id);
  return user;
}

/** API responses use absolute download links. */
export const publicResult = (r: TaskResult) => ({
  file_name: r.fileName,
  size: r.size,
  input_size: r.inputSize,
  file_count: r.count,
  download_url: `${SITE_URL}${r.downloadUrl}`,
  expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
});

export type ApiTask = {
  id: string;
  tool: string;
  status: "queued" | "processing" | "done" | "failed";
  result: string | null;
  error: string | null;
  created_at: number;
  finished_at: number | null;
};

export function taskOf(userId: number, id: string): ApiTask | null {
  return (
    (db
      .prepare("SELECT id, tool, status, result, error, created_at, finished_at FROM api_tasks WHERE id = ? AND user_id = ?")
      .get(id, userId) as ApiTask | undefined) ?? null
  );
}

export const taskJson = (t: ApiTask) => ({
  id: t.id,
  tool: t.tool,
  status: t.status,
  result: t.result ? JSON.parse(t.result) : null,
  error: t.error,
  created_at: new Date(t.created_at).toISOString(),
  finished_at: t.finished_at ? new Date(t.finished_at).toISOString() : null,
});

/** Starts a task in the background; the result arrives by webhook or GET /api/v1/tasks/{id}. */
export function startTask(user: User, input: TaskInput, webhookUrl: string | null): string {
  const id = `task_${randomUUID().replaceAll("-", "")}`;
  db.prepare("INSERT INTO api_tasks (id, user_id, tool, status, webhook_url, created_at) VALUES (?, ?, ?, 'queued', ?, ?)").run(
    id,
    user.id,
    input.slug,
    webhookUrl,
    Date.now(),
  );
  void (async () => {
    db.prepare("UPDATE api_tasks SET status = 'processing' WHERE id = ?").run(id);
    try {
      const result = publicResult(await runTask(input));
      db.prepare("UPDATE api_tasks SET status = 'done', result = ?, finished_at = ? WHERE id = ?").run(JSON.stringify(result), Date.now(), id);
      await dispatchWebhook(user.id, "task.completed", { task_id: id, tool: input.slug, ...result }, webhookUrl);
    } catch (e) {
      const message = e instanceof TaskError ? e.message : "Processing failed.";
      db.prepare("UPDATE api_tasks SET status = 'failed', error = ?, finished_at = ? WHERE id = ?").run(message, Date.now(), id);
      await dispatchWebhook(user.id, "task.failed", { task_id: id, tool: input.slug, error: message }, webhookUrl);
    }
  })();
  return id;
}

/** Deletes task records older than a week (scheduler). */
export function sweepApiTasks() {
  db.prepare("DELETE FROM api_tasks WHERE created_at < ?").run(Date.now() - 7 * 86_400_000);
}

export const apiError = (status: number, message: string) =>
  Response.json({ error: { status, message } }, { status, headers: { "Cache-Control": "no-store" } });
