import { readFile } from "node:fs/promises";
import { currentUser } from "@/server/auth";
import { backupPath } from "@/server/backup";

export const runtime = "nodejs";

/** Admins only: download one database backup. */
export async function GET(_request: Request, ctx: RouteContext<"/api/admin/backups/[name]">) {
  const user = await currentUser();
  const { name } = await ctx.params;
  const file = backupPath(name);
  if (!user?.admin || !file) return new Response("Not found.", { status: 404 });
  try {
    return new Response(await readFile(file), {
      headers: {
        "Content-Type": "application/vnd.sqlite3",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("Not found.", { status: 404 });
  }
}
