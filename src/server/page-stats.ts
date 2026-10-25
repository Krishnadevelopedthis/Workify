import "server-only";
import { db } from "./db";
import { isLocale, LOCALES, splitLocale } from "@/i18n/config";
import { TOOL_BY_SLUG } from "@/lib/tools";

// Visitor counts, kept as daily totals only: no cookies, no IP addresses and no
// row per visit, so a single person can never be picked out of this table.

/** Pages worth counting on their own; everything else is grouped. */
const PAGES = new Set([
  "/", "/tools", "/pricing", "/faq", "/features", "/security", "/privacy", "/terms", "/cookies",
  "/about", "/contact", "/blog", "/press", "/desktop", "/mobile", "/business", "/education",
  "/developers", "/login", "/signup", "/create-workflow",
]);

const DEVICES = new Set(["mobile", "tablet", "desktop"]);

/** Keeps only paths the app itself serves, so no visitor-typed text is stored. */
export function knownPath(pathname: string): string | null {
  const [, rest] = splitLocale(pathname);
  const clean = rest.length > 1 ? rest.replace(/\/+$/, "") : rest;
  if (PAGES.has(clean)) return clean;
  if (TOOL_BY_SLUG.has(clean.slice(1))) return clean;
  if (clean.startsWith("/blog/")) return "/blog/*";
  if (clean.startsWith("/account")) return "/account";
  if (clean.startsWith("/sign")) return "/sign";
  return null;
}

/** The site the visitor came from, as a bare host; same-site and junk become "". */
export function referrerHost(referrer: string, siteHost: string): string {
  if (!referrer) return "";
  let host;
  try {
    host = new URL(referrer).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
  if (!host || host === siteHost.replace(/^www\./, "").toLowerCase()) return "";
  return host.length > 60 ? "" : host;
}

export function day(at = Date.now()): string {
  return new Date(at).toISOString().slice(0, 10);
}

export function recordView(input: { path: string; lang: string; device: string; referrer: string; firstOfSession: boolean }) {
  const path = knownPath(input.path);
  if (!path) return;
  const lang = isLocale(input.lang) ? input.lang : LOCALES[0];
  const device = DEVICES.has(input.device) ? input.device : "desktop";
  db.prepare(
    `INSERT INTO page_stats (day, path, lang, device, referrer, views, visits) VALUES (?, ?, ?, ?, ?, 1, ?)
     ON CONFLICT (day, path, lang, device, referrer)
     DO UPDATE SET views = views + 1, visits = visits + excluded.visits`,
  ).run(day(), path, lang, device, input.referrer, input.firstOfSession ? 1 : 0);
}

export type Totals = { views: number; visits: number };
export type Row = { name: string; views: number; visits: number };

const since = (days: number) => day(Date.now() - (days - 1) * 86_400_000);

export function totals(days: number): Totals {
  return db
    .prepare("SELECT COALESCE(SUM(views), 0) AS views, COALESCE(SUM(visits), 0) AS visits FROM page_stats WHERE day >= ?")
    .get(since(days)) as Totals;
}

function top(column: "path" | "referrer" | "lang" | "device", days: number, limit: number, skipEmpty = false): Row[] {
  return db
    .prepare(
      `SELECT ${column} AS name, SUM(views) AS views, SUM(visits) AS visits FROM page_stats
       WHERE day >= ?${skipEmpty ? ` AND ${column} != ''` : ""}
       GROUP BY ${column} ORDER BY views DESC LIMIT ?`,
    )
    .all(since(days), limit) as Row[];
}

export const topPages = (days: number, limit = 10) => top("path", days, limit);
export const topReferrers = (days: number, limit = 10) => top("referrer", days, limit, true);
export const topLanguages = (days: number, limit = 11) => top("lang", days, limit);
export const topDevices = (days: number) => top("device", days, 3);

/** Views and visits per day, oldest first, with empty days filled in. */
export function perDay(days: number): { day: string; views: number; visits: number }[] {
  const rows = db
    .prepare("SELECT day, SUM(views) AS views, SUM(visits) AS visits FROM page_stats WHERE day >= ? GROUP BY day")
    .all(since(days)) as { day: string; views: number; visits: number }[];
  const found = new Map(rows.map((r) => [r.day, r]));
  return Array.from({ length: days }, (_, i) => {
    const d = day(Date.now() - (days - 1 - i) * 86_400_000);
    return found.get(d) ?? { day: d, views: 0, visits: 0 };
  });
}
