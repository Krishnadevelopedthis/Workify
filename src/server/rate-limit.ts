import "server-only";

// In-memory limits. Two layers:
//  1. Per-client sliding windows (best effort: the client IP comes from
//     X-Forwarded-For, which only a reverse proxy can make trustworthy).
//  2. Global windows and a concurrency gate that no client can bypass, so the
//     server keeps working even if per-client limits are evaded.

type Window = { hits: number[] };
const g = globalThis as unknown as { workifyLimits?: Map<string, Window>; workifyGate?: Gate };
const windows: Map<string, Window> = (g.workifyLimits ??= new Map<string, Window>());

/** Returns true if allowed; records the hit. */
function take(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const w = windows.get(key) ?? { hits: [] };
  w.hits = w.hits.filter((t) => now - t < windowMs);
  if (w.hits.length >= limit) {
    windows.set(key, w);
    return false;
  }
  w.hits.push(now);
  windows.set(key, w);
  return true;
}

// Forget idle keys so the map cannot grow without bound.
setInterval(() => {
  const now = Date.now();
  for (const [k, w] of windows) if (!w.hits.some((t) => now - t < 3_600_000)) windows.delete(k);
}, 600_000).unref();

/**
 * Client address from X-Forwarded-For. Each trusted proxy APPENDS the address it
 * saw, so with N trusted proxies (WORKIFY_TRUST_PROXY=N) the real client is the
 * N-th entry from the end; anything before it may be forged by the client.
 * With no proxy the whole header is client-controlled, so the result is only a
 * best-effort key (the global limits still apply).
 */
export function clientIp(headers: Headers) {
  const xff = headers.get("x-forwarded-for");
  if (!xff) return "local";
  const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
  const hops = Math.max(1, Math.floor(Number(process.env.WORKIFY_TRUST_PROXY) || 1));
  return parts[Math.max(0, parts.length - hops)] ?? "unknown";
}

export type LimitRule = { perClient: number; global: number; windowMs: number };

export const LIMITS = {
  process: { perClient: 40, global: 600, windowMs: 10 * 60_000 },
  light: { perClient: 120, global: 3000, windowMs: 10 * 60_000 },
  signRequest: { perClient: 20, global: 300, windowMs: 60 * 60_000 },
  auth: { perClient: 20, global: 500, windowMs: 15 * 60_000 },
  contact: { perClient: 5, global: 100, windowMs: 60 * 60_000 },
  /** Actions that send an email to an address the user typed. */
  email: { perClient: 10, global: 300, windowMs: 60 * 60_000 },
  /** Developer API calls, keyed by API key. */
  api: { perClient: 120, global: 2000, windowMs: 10 * 60_000 },
} satisfies Record<string, LimitRule>;

/** Checks both layers. Returns an error message when the request must be refused. */
export function rateLimit(name: keyof typeof LIMITS, headers: Headers, extraKey?: string): string | null {
  const rule = LIMITS[name];
  if (!take(`g:${name}`, rule.global, rule.windowMs)) return "Workify is very busy right now. Please try again in a few minutes.";
  if (!take(`c:${name}:${clientIp(headers)}`, rule.perClient, rule.windowMs)) {
    return "Too many requests. Please wait a few minutes and try again.";
  }
  if (extraKey && !take(`k:${name}:${extraKey}`, Math.ceil(rule.perClient / 2), rule.windowMs)) {
    return "Too many attempts. Please wait a few minutes and try again.";
  }
  return null;
}

/** Limits how many heavy jobs run at once; extra jobs wait in a bounded queue. */
class Gate {
  private running = 0;
  private waiters: (() => void)[] = [];
  constructor(
    private max: number,
    private maxQueue: number,
  ) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running >= this.max) {
      if (this.waiters.length >= this.maxQueue) throw new BusyError();
      await new Promise<void>((r) => this.waiters.push(r));
    }
    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      this.waiters.shift()?.();
    }
  }
}

export class BusyError extends Error {
  constructor() {
    super("Workify is processing many files right now. Please try again in a minute.");
  }
}

export const heavyGate = (g.workifyGate ??= new Gate(
  Math.max(1, Number(process.env.WORKIFY_MAX_JOBS) || 4),
  Math.max(0, Number(process.env.WORKIFY_MAX_QUEUE) || 20),
));

/** 429 response helper for route handlers. */
export const tooMany = (message: string) =>
  Response.json({ error: message }, { status: 429, headers: { "Retry-After": "120" } });
