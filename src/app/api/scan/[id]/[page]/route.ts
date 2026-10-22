import { readFile } from "node:fs/promises";
import path from "node:path";
import { jobDir } from "@/server/jobs";

export const runtime = "nodejs";

export async function GET(_request: Request, ctx: RouteContext<"/api/scan/[id]/[page]">) {
  const { id, page } = await ctx.params;
  const dir = jobDir(id);
  if (!dir || !/^\d+_\d{3}\.jpg$/.test(page)) return new Response("Not found", { status: 404 });
  try {
    const bytes = await readFile(path.join(dir, "in", page));
    return new Response(bytes, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
