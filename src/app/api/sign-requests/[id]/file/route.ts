import { readFile } from "node:fs/promises";
import path from "node:path";
import { getRequest, requestDir } from "@/server/sign-requests";

export const runtime = "nodejs";

/** The original PDF (for the signer) or, with ?signed=1, the signed result. */
export async function GET(request: Request, ctx: RouteContext<"/api/sign-requests/[id]/file">) {
  const { id } = await ctx.params;
  const req = getRequest(id);
  const dir = requestDir(id);
  if (!req || !dir) return new Response("This signing link is invalid or has expired.", { status: 404 });
  const signed = new URL(request.url).searchParams.get("signed") === "1";
  if (signed && req.status !== "signed") return new Response("Not signed yet.", { status: 409 });
  const bytes = await readFile(path.join(dir, signed ? "signed.pdf" : "original.pdf"));
  const name = signed ? req.file_name.replace(/\.pdf$/i, "") + "_signed.pdf" : req.file_name;
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${signed ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
