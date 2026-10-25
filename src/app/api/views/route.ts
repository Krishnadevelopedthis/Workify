import { rateLimit } from "@/server/rate-limit";
import { day, recordView, referrerHost } from "@/server/page-stats";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";

/**
 * One page view, sent by src/components/PageView.tsx. Only daily totals are
 * kept (see page-stats.ts): no cookies, no IP address, no per-visit row.
 */
export async function POST(request: Request) {
  if (rateLimit("light", request.headers)) return new Response(null, { status: 204 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 204 });
  }
  const v = body as Record<string, unknown>;
  const str = (x: unknown, max: number) => (typeof x === "string" && x.length <= max ? x : "");

  try {
    recordView({
      path: str(v.path, 300),
      lang: str(v.lang, 8),
      device: str(v.device, 10),
      referrer: referrerHost(str(v.referrer, 500), new URL(SITE_URL).hostname),
      firstOfSession: v.first === true,
    });
  } catch {
    // Counting a visit must never break the page.
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

/** Lets the admin page show "today" without a round trip through the client. */
export function GET() {
  return Response.json({ day: day() }, { headers: { "Cache-Control": "no-store" } });
}
