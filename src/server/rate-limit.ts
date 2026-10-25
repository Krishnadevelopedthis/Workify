import "server-only";

// In-memory limits. Two layers:
//  1. Per-client sliding windows (best effort: the client IP comes from
//     X-Forwarded-For, which only a reverse proxy can make trustworthy).
//  2. Global windows and a concurrency gate that no client can bypass, so the
//     server keeps working even if per-client limits are evaded.

type Window = { hits: number[] };
const g = globalThis as unknown as { workifyLimits?: Map<string, Window>; workifyGate?: Gate };
const windows: Map<string, Window> = (g.workifyLimits ??= new Map<string, Window>());

/** The window for `key`, with hits older than `windowMs` dropped. Records nothing. */
function current(key: string, windowMs: number) {
  const now = Date.now();
  const w = windows.get(key) ?? { hits: [] };
  w.hits = w.hits.filter((t) => now - t < windowMs);
  if (w.hits.length) windows.set(key, w);
  else windows.delete(key);
  return w;
}

/** Records one hit in each window. */
function record(entries: [string, Window][]) {
  const now = Date.now();
  for (const [key, w] of entries) {
    w.hits.push(now);
    windows.set(key, w);
  }
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
  if (parts.length < hops) warnShortChain(parts.length, hops);
  return parts[Math.max(0, parts.length - hops)] ?? "unknown";
}

let warnedShortChain = false;
/**
 * Fewer X-Forwarded-For entries than trusted proxies means a proxy replaced the
 * header instead of appending to it (for example Caddy without trusted_proxies
 * behind Cloudflare), so every visitor would share one proxy address.
 */
function warnShortChain(entries: number, hops: number) {
  if (warnedShortChain) return;
  warnedShortChain = true;
  console.warn(
    `[rate-limit] WORKIFY_TRUST_PROXY=${hops} but X-Forwarded-For has only ${entries} entries; ` +
      "per-client limits may be keyed on a proxy address. Check the proxy chain (see DEPLOY.md).",
  );
}

/**
 * Bucket key for a client address. One IPv6 user usually holds a whole /64, so
 * all addresses in a /64 share a bucket instead of each getting its own limit.
 */
export function clientBucket(ip: string) {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return mapped[1];
  if (!ip.includes(":")) return ip;
  const addr = ip.replace(/^\[|\](:\d+)?$/g, "").split("%")[0].toLowerCase();
  const [head, tail, ...rest] = addr.split("::");
  if (rest.length) return ip;
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = tail === undefined ? left : [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
  if (groups.length !== 8 || !groups.every((x) => /^[0-9a-f]{1,4}$/.test(x))) return ip;
  return `${groups.slice(0, 4).map((x) => x.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

export type LimitRule = { perClient: number; global: number; windowMs: number };

export const LIMITS = {
  // The job queue (WORKIFY_MAX_JOBS / WORKIFY_MAX_QUEUE) already protects the
  // server, so the site-wide cap only stops floods. A 1000-visitor test hit the
  // old 600 with ordinary traffic. Tune it with WORKIFY_PROCESS_GLOBAL_LIMIT.
  process: { perClient: 40, global: Math.max(1, Number(process.env.WORKIFY_PROCESS_GLOBAL_LIMIT) || 6000), windowMs: 10 * 60_000 },
  light: { perClient: 120, global: 3000, windowMs: 10 * 60_000 },
  signRequest: { perClient: 20, global: 300, windowMs: 60 * 60_000 },
  /** Shared by every auth action; the global cap only guards the server against scrypt floods. */
  auth: { perClient: 20, global: 2000, windowMs: 15 * 60_000 },
  contact: { perClient: 5, global: 100, windowMs: 60 * 60_000 },
  /** Actions that send an email to an address the user typed. */
  email: { perClient: 10, global: 300, windowMs: 60 * 60_000 },
} satisfies Record<string, LimitRule>;

/**
 * Checks both layers. Returns an error message when the request must be refused.
 * The per-client (and extraKey) windows are checked first, and a hit is recorded
 * in the windows only when every one of them allows the request, so requests a
 * client sends past its own limit do not use up the global window everyone shares.
 */
export function rateLimit(name: keyof typeof LIMITS, headers: Headers, extraKey?: string): string | null {
  const rule = LIMITS[name];
  const clientKey = `c:${name}:${clientBucket(clientIp(headers))}`;
  const client = current(clientKey, rule.windowMs);
  if (client.hits.length >= rule.perClient) return "Too many requests. Please wait a few minutes and try again.";
  const entries: [string, Window][] = [[clientKey, client]];
  if (extraKey) {
    const key = `k:${name}:${extraKey}`;
    const extra = current(key, rule.windowMs);
    if (extra.hits.length >= Math.ceil(rule.perClient / 2)) return "Too many attempts. Please wait a few minutes and try again.";
    entries.push([key, extra]);
  }
  const global = current(`g:${name}`, rule.windowMs);
  if (global.hits.length >= rule.global) return "Workify is very busy right now. Please try again in a few minutes.";
  entries.push([`g:${name}`, global]);
  // Synchronous with the checks above, so no other request can slip in between.
  record(entries);
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
