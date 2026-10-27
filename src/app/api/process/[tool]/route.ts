import { requestT } from "@/i18n/request";
import { rateLimit, tooMany } from "@/server/rate-limit";
import { checkTool, runTask, TaskError } from "@/server/run-task";
import {
  declaredLength,
  MAX_REQUEST_BYTES,
  readUploadForm,
  UploadAbort,
  uploadBudget,
  uploadClient,
  type UploadHold,
} from "@/server/upload-budget";

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
  // Refuse oversized uploads before buffering the body into memory. A request
  // without a Content-Length (chunked) could stream an unbounded body, so it is
  // refused too; Node stops reading the body at the declared length.
  const declared = declaredLength(request.headers);
  if (declared === null) return fail(411, t("The upload could not be read. Try again."));
  if (declared > MAX_REQUEST_BYTES) return fail(413, t("All files together can be at most 500 MB."));
  const limited = rateLimit("process", request.headers);
  if (limited) return tooMany(t(limited));
  // The form is buffered in memory before the heavy-job gate applies, so the
  // bytes all in-flight uploads hold are capped globally and per client. Only
  // bytes that actually arrived are held, and a stalled body is abandoned, so
  // idle connections cannot lock the budget for everyone else.
  const busy = () =>
    Response.json(
      { error: t("Workify is processing many files right now. Please try again in a minute.") },
      { status: 503, headers: { "Retry-After": "30" } },
    );
  const hold = uploadBudget.open(declared, uploadClient(request.headers));
  if (!hold) return busy();
  try {
    return await handleUpload(request, hold, slug, fail, busy, t);
  } finally {
    hold.release();
  }
}

async function handleUpload(
  request: Request,
  hold: UploadHold,
  slug: string,
  fail: (status: number, error: string) => Response,
  busy: () => Response,
  t: Awaited<ReturnType<typeof requestT>>["t"],
) {
  let form: FormData;
  try {
    form = await readUploadForm(request, hold);
  } catch (e) {
    if (e instanceof UploadAbort && e.reason === "busy") return busy();
    if (e instanceof UploadAbort && e.reason !== "too-large") return fail(408, t("The upload could not be read. Try again."));
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
    });
    return Response.json(result);
  } catch (e) {
    if (e instanceof TaskError) return fail(e.status, t(e.template, e.vars));
    throw e;
  }
}
