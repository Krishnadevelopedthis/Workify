import { deleteJob, jobDir } from "@/server/jobs";

export const runtime = "nodejs";

/** "Delete files" on the download page removes the job immediately. */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/jobs/[job]">) {
  const { job } = await ctx.params;
  if (!jobDir(job)) return Response.json({ error: "Not found" }, { status: 404 });
  await deleteJob(job);
  return Response.json({ ok: true });
}
