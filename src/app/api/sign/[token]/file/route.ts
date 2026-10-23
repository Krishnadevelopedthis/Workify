import { requestT } from "@/i18n/request";
import { clientOf, pdfResponse } from "@/server/sign-http";
import { canSign, isExpired, markViewed, signerByToken } from "@/server/sign-requests";

export const runtime = "nodejs";

/** For a signer: the document to sign, or with ?final=1 the completed, sealed PDF. */
export async function GET(request: Request, ctx: RouteContext<"/api/sign/[token]/file">) {
  const { t } = await requestT(request.headers);
  const found = signerByToken((await ctx.params).token);
  if (!found || (isExpired(found.request) && found.request.status !== "completed")) {
    return new Response(t("This signing link is invalid or has expired."), { status: 404 });
  }
  const final = new URL(request.url).searchParams.get("final") === "1";
  if (final && found.request.status !== "completed") return new Response(t("Not everyone has signed yet."), { status: 409 });
  // Opening the document in the signing page counts as "viewed" (link
  // scanners in mail apps fetch the page, not this file).
  if (!final && canSign(found.request, found.signer)) markViewed(found.request, found.signer, clientOf(request));
  return pdfResponse(found.request, final ? "final" : "current", final ? "attachment" : "inline");
}
