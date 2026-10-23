import "server-only";
import { sweepApiTasks } from "./api";
import { adminEmails } from "./auth";
import { dailyBackup } from "./backup";
import { db } from "./db";
import { sendErrorDigest } from "./emails";
import { retryQueuedEmails } from "./mail";
import { logError } from "./monitor";
import { sendDueReminders, sweepExpired } from "./sign-requests";

// Background housekeeping, every 10 minutes while the server runs. Started by
// the first request (the header's /api/session call or the Docker health check).

const EVERY_MS = 10 * 60_000;
const g = globalThis as unknown as { workifyScheduler?: { lastDigest: number } };

async function errorDigest(state: { lastDigest: number }) {
  if (Date.now() - state.lastDigest < 3_600_000) return;
  const since = Math.max(state.lastDigest, Date.now() - 3_600_000);
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM error_log WHERE at > ?").get(since) as { n: number };
  if (!n) return;
  const latest = db.prepare("SELECT source, message FROM error_log ORDER BY id DESC LIMIT 1").get() as { source: string; message: string };
  state.lastDigest = Date.now();
  for (const to of adminEmails()) await sendErrorDigest(to, n, `[${latest.source}] ${latest.message}`);
}

function pruneLogs() {
  const day = 86_400_000;
  db.prepare("DELETE FROM error_log WHERE at < ?").run(Date.now() - 30 * day);
  db.prepare("DELETE FROM task_stats WHERE at < ?").run(Date.now() - 90 * day);
  db.prepare("DELETE FROM outbox WHERE created_at < ? AND status != 'queued'").run(Date.now() - 30 * day);
  db.prepare("DELETE FROM auth_tokens WHERE expires_at < ?").run(Date.now());
}

export function ensureScheduler() {
  if (g.workifyScheduler || process.env.NEXT_PHASE === "phase-production-build") return;
  const state = (g.workifyScheduler = { lastDigest: 0 });
  const tasks: [string, () => unknown][] = [
    ["email", retryQueuedEmails],
    ["reminders", sendDueReminders],
    ["expiry", sweepExpired],
    ["api-tasks", sweepApiTasks],
    ["backup", dailyBackup],
    ["digest", () => errorDigest(state)],
    ["prune", pruneLogs],
  ];
  const tick = async () => {
    for (const [name, fn] of tasks) {
      try {
        await fn();
      } catch (e) {
        logError("scheduler", `Task "${name}" failed`, e);
      }
    }
  };
  setTimeout(tick, 30_000).unref();
  setInterval(tick, EVERY_MS).unref();
}
