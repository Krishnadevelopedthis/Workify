import { ApiError, authenticate } from "@/server/api";
import { getRequest } from "@/server/sign-requests";
import { handle, json } from "../../_lib";
import { requestJson } from "../shared";

export const runtime = "nodejs";

/** Status of one signature request, with each signer's progress. */
export async function GET(request: Request, ctx: RouteContext<"/api/v1/signatures/[id]">) {
  return handle(async () => {
    const user = authenticate(request);
    const req = getRequest((await ctx.params).id);
    if (!req || req.owner_id !== user.id) throw new ApiError(404, "Signature request not found.");
    return json(requestJson(req, true));
  });
}
