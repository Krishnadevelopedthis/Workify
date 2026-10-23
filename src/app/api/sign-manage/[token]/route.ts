import { requestT } from "@/i18n/request";
import { rateLimit, tooMany } from "@/server/rate-limit";
import { clientOf, pdfResponse } from "@/server/sign-http";
import { cancel, remind, requestByManageToken } from "@/server/sign-requests";

export const runtime = "nodejs";

/** Owner (private management link): download with ?which=final|current. */
export async function GET(request: Request, ctx: RouteContext<"/api/sign-manage/[token]">) {
  const { t } = await requestT(request.headers);
  const req = requestByManageToken((await ctx.params).token);
  if (!req) return new Response(t("This link is invalid or has expired."), { status: 404 });
  const which = new URL(request.url).searchParams.get("which") === "final" ? "final" : "current";
  return pdfResponse(req, which, "attachment");
}

/** Owner actions: { action: "remind" | "cancel" }. */
export async function POST(request: Request, ctx: RouteContext<"/api/sign-manage/[token]">) {
  const { t } = await requestT(request.headers);
  const req = requestByManageToken((await ctx.params).token);
  if (!req) return Response.json({ error: t("This link is invalid or has expired.") }, { status: 404 });
  const limited = rateLimit("email", request.headers, `manage:${req.id}`);
  if (limited) return tooMany(t(limited));
  const { action } = (await request.json().catch(() => ({}))) as { action?: string };
  if (action === "cancel") {
    await cancel(req, clientOf(request));
    return Response.json({ ok: true });
  }
  if (action === "remind") return Response.json({ ok: true, reminded: await remind(req, clientOf(request)) });
  return Response.json({ error: t("Unknown action.") }, { status: 400 });
}
