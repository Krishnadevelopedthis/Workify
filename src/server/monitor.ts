import "server-only";
import { db } from "./db";

// Lightweight self-hosted monitoring: errors and task timings go to SQLite and
// are shown in the admin panel; admins get an email digest (see scheduler).

export function logError(source: string, message: string, detail?: unknown) {
  const text = detail instanceof Error ? `${detail.message}\n${detail.stack ?? ""}` : detail === undefined ? null : String(detail);
  console.error(`[${source}]`, message, text ?? "");
  try {
    db.prepare("INSERT INTO error_log (source, message, detail, at) VALUES (?, ?, ?, ?)").run(
      source.slice(0, 60),
      message.slice(0, 1000),
      text?.slice(0, 8000) ?? null,
      Date.now(),
    );
  } catch {
    // Logging must never break the request that failed.
  }
}

export function recordTask(tool: string, source: "web" | "api", ok: boolean, ms: number, bytes: number) {
  try {
    db.prepare("INSERT INTO task_stats (tool, source, ok, ms, bytes, at) VALUES (?, ?, ?, ?, ?, ?)").run(
      tool,
      source,
      ok ? 1 : 0,
      Math.round(ms),
      bytes,
      Date.now(),
    );
  } catch {
    // Statistics are best-effort.
  }
}
