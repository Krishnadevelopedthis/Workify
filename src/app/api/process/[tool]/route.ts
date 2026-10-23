import { requestT } from "@/i18n/request";
import { rateLimit, tooMany } from "@/server/rate-limit";
import { checkTool, LIMITS, runTask, TaskError } from "@/server/run-task";

export const runtime = "nodejs";
export const maxDuration = 900;

/** The website's tool endpoint: multipart files + JSON options in, a download link out. */
export async function POST(request: Request, ctx: RouteContext<"/api/process/[tool]">) {
  const { tool: slug } = await ctx.params;
  const { t } = await requestT(request.headers);
  const fail = (status: number, error: string) => Response.json({ error }, { status });

  try {
    checkTool(slug); // unknown/unavailable tools fail before the upload is read
  } catch (e) {
    if (e instanceof TaskError) return fail(e.status, t(e.template, e.vars));
    throw e;
  }
  // Refuse oversized uploads before buffering the body into memory.
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > LIMITS.maxTotal + 10 * 1024 * 1024) return fail(413, t("All files together can be at most 500 MB."));
  const limited = rateLimit("process", request.headers);
  if (limited) return tooMany(t(limited));

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, t("The upload could not be read. Try again."));
  }

  let options: Record<string, unknown>;
  try {
    options = JSON.parse(String(form.get("options") ?? "{}")) as Record<string, unknown>;
  } catch {
    return fail(400, t("The tool settings could not be read."));
  }
  const extras = [...form.entries()]
    .filter((e): e is [string, File] => e[0].startsWith("extra:") && e[1] instanceof File)
    .map(([k, v]) => [k.slice(6), v] as [string, File]);

  try {
    const result = await runTask({
      slug,
      files: form.getAll("files").filter((f): f is File => f instanceof File),
      options,
      extras,
      source: "web",
    });
    return Response.json(result);
  } catch (e) {
    if (e instanceof TaskError) return fail(e.status, t(e.template, e.vars));
    throw e;
  }
}
