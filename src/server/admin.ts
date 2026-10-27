import "server-only";
import { statfs } from "node:fs/promises";
import { notFound } from "next/navigation";
import { currentUser, type User } from "./auth";
import { DATA_DIR, db } from "./db";

/** The signed-in admin, or a 404 for everyone else (the panel's existence is not revealed). */
export async function requireAdmin(): Promise<User> {
  const user = await currentUser();
  if (!user?.admin) notFound();
  return user;
}

const count = (sql: string, ...args: (string | number)[]) => (db.prepare(sql).get(...args) as { n: number }).n;

export async function dashboardStats() {
  const day = 86_400_000;
  const now = Date.now();
  const tasksByTool = db
    .prepare(
      `SELECT tool, COUNT(*) AS n, SUM(ok = 0) AS failed, CAST(AVG(ms) AS INTEGER) AS avg_ms
       FROM task_stats WHERE at > ? GROUP BY tool ORDER BY n DESC LIMIT 12`,
    )
    .all(now - 7 * day) as { tool: string; n: number; failed: number; avg_ms: number }[];
  const daily = db
    .prepare(
      `SELECT CAST((at - ?) / ? AS INTEGER) AS d, COUNT(*) AS n FROM task_stats WHERE at > ? GROUP BY d ORDER BY d`,
    )
    .all(now - 14 * day, day, now - 14 * day) as { d: number; n: number }[];
  let disk: { free: number; total: number } | null = null;
  try {
    const s = await statfs(DATA_DIR);
    disk = { free: s.bavail * s.bsize, total: s.blocks * s.bsize };
  } catch {
    disk = null;
  }
  return {
    users: count("SELECT COUNT(*) AS n FROM users"),
    verifiedUsers: count("SELECT COUNT(*) AS n FROM users WHERE email_verified_at IS NOT NULL"),
    newUsers7d: count("SELECT COUNT(*) AS n FROM users WHERE created_at > ?", now - 7 * day),
    tasks24h: count("SELECT COUNT(*) AS n FROM task_stats WHERE at > ?", now - day),
    tasks7d: count("SELECT COUNT(*) AS n FROM task_stats WHERE at > ?", now - 7 * day),
    failed24h: count("SELECT COUNT(*) AS n FROM task_stats WHERE at > ? AND ok = 0", now - day),
    pendingSignatures: count("SELECT COUNT(*) AS n FROM sign_requests WHERE status = 'pending' AND expires_at > ?", now),
    completedSignatures: count("SELECT COUNT(*) AS n FROM sign_requests WHERE status = 'completed'"),
    openMessages: count("SELECT COUNT(*) AS n FROM contact_messages WHERE handled_at IS NULL"),
    queuedEmails: count("SELECT COUNT(*) AS n FROM outbox WHERE status = 'queued'"),
    failedEmails: count("SELECT COUNT(*) AS n FROM outbox WHERE status = 'failed'"),
    loggedEmails: count("SELECT COUNT(*) AS n FROM outbox WHERE status = 'logged'"),
    errors24h: count("SELECT COUNT(*) AS n FROM error_log WHERE at > ?", now - day),
    waitlist: count("SELECT COUNT(*) AS n FROM premium_waitlist"),
    tasksByTool,
    daily: Array.from({ length: 14 }, (_, d) => daily.find((x) => x.d === d)?.n ?? 0),
    disk,
  };
}
