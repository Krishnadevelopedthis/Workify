import { requestT } from "@/i18n/request";
import { currentUser } from "@/server/auth";
import { pdfResponse } from "@/server/sign-http";
import { getRequest } from "@/server/sign-requests";

export const runtime = "nodejs";

/** Signed-in owner: download a request's PDF (?which=final|current). */
export async function GET(request: Request, ctx: RouteContext<"/api/sign-requests/[id]/file">) {
  const { t } = await requestT(request.headers);
  const user = await currentUser();
  const req = getRequest((await ctx.params).id);
  if (!user || !req || req.owner_id !== user.id) return new Response(t("Not found."), { status: 404 });
  const which = new URL(request.url).searchParams.get("which") === "final" ? "final" : "current";
  return pdfResponse(req, which, "attachment");
}
