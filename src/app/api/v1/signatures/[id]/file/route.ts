import { ApiError, authenticate } from "@/server/api";
import { pdfResponse } from "@/server/sign-http";
import { getRequest } from "@/server/sign-requests";
import { handle } from "../../../_lib";

export const runtime = "nodejs";

/** The completed, sealed PDF (with the audit trail). */
export async function GET(request: Request, ctx: RouteContext<"/api/v1/signatures/[id]/file">) {
  return handle(async () => {
    const user = authenticate(request);
    const req = getRequest((await ctx.params).id);
    if (!req || req.owner_id !== user.id) throw new ApiError(404, "Signature request not found.");
    if (req.status !== "completed") throw new ApiError(409, "Not everyone has signed yet.");
    return pdfResponse(req, "final", "attachment");
  });
}
