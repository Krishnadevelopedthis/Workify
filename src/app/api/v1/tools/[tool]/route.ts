import { readFile } from "node:fs/promises";
import path from "node:path";
import { TOOL_BY_SLUG } from "@/lib/tools";
import { ApiError, authenticate, publicResult, startTask } from "@/server/api";
import { jobDir } from "@/server/jobs";
import { checkTool, runTask, validateTask } from "@/server/run-task";
import {
  declaredLength,
  MAX_REQUEST_BYTES,
  readUploadForm,
  UploadAbort,
  uploadBudget,
  uploadClient,
  type UploadHold,
} from "@/server/upload-budget";
import { validateWebhookUrl } from "@/server/webhooks";
import { handle, json } from "../../_lib";

export const runtime = "nodejs";
export const maxDuration = 900;

const BUSY = "Workify is processing many files right now. Please try again in a minute.";

/**
 * Runs a tool. multipart/form-data with:
 *   files       one or more files
 *   options     JSON object of tool options (defaults apply for missing ones)
 *   extra:<key> extra uploads, e.g. extra:image for an image watermark
 *   webhook_url optional: run in the background and POST the result there
 *   async       "true": run in the background (poll GET /api/v1/tasks/{id})
 * ?response=file streams the result file instead of returning JSON.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/v1/tools/[tool]">) {
  return handle(async () => {
    const user = authenticate(request);
    const { tool: slug } = await ctx.params;
    const tool = checkTool(slug);
    // As on the website: no unbounded (chunked) bodies, and the bytes all
    // in-flight uploads hold in memory are capped globally and per client
    // (counting only bytes that arrived; stalled bodies are abandoned).
    const declared = declaredLength(request.headers);
    if (declared === null) throw new ApiError(411, "Send the request with a Content-Length header (chunked uploads are not accepted).");
    if (declared > MAX_REQUEST_BYTES) throw new ApiError(413, "All files together can be at most 500 MB.");
    const hold = uploadBudget.open(declared, uploadClient(request.headers));
    if (!hold) throw new ApiError(503, BUSY);
    let background = false;
    try {
      return await handleUpload(request, hold, user, slug, tool.slug, () => {
        background = true;
        return hold.release;
      });
    } finally {
      if (!background) hold.release();
    }
  });
}

/** `toBackground` hands the upload reservation to a background task, which releases it when done. */
async function handleUpload(
  request: Request,
  hold: UploadHold,
  user: ReturnType<typeof authenticate>,
  slug: string,
  toolSlug: string,
  toBackground: () => () => void,
) {
  const form = await readUploadForm(request, hold).catch((e: unknown) => {
    if (e instanceof UploadAbort && e.reason === "busy") throw new ApiError(503, BUSY);
    if (e instanceof UploadAbort && e.reason !== "too-large") throw new ApiError(408, "The upload stopped sending data or took too long. Try again.");
    throw new ApiError(400, "Send the request as multipart/form-data.");
  });
  let options: Record<string, unknown>;
  try {
    options = JSON.parse(String(form.get("options") ?? "{}"));
    if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error();
  } catch {
    throw new ApiError(400, "`options` must be a JSON object.");
  }
  const defaults = Object.fromEntries((TOOL_BY_SLUG.get(slug)?.options ?? []).filter((o) => "default" in o).map((o) => [o.key, (o as { default: unknown }).default]));
  const input = {
    slug,
    files: form.getAll("files").filter((f): f is File => f instanceof File),
    options: { ...defaults, ...options },
    extras: [...form.entries()]
      .filter((e): e is [string, File] => e[0].startsWith("extra:") && e[1] instanceof File)
      .map(([k, v]) => [k.slice(6), v] as [string, File]),
    source: "api" as const,
  };
  validateTask(input);

  const rawHook = String(form.get("webhook_url") ?? "").trim();
  const webhookUrl = rawHook ? await validateWebhookUrl(rawHook).catch((e: Error) => { throw new ApiError(400, e.message); }) : null;
  if (webhookUrl || String(form.get("async") ?? "") === "true") {
    const id = startTask(user, input, webhookUrl, toBackground());
    return json({ id, status: "queued", tool: toolSlug, status_url: `/api/v1/tasks/${id}` }, 202);
  }

  const result = await runTask(input);
  if (new URL(request.url).searchParams.get("response") === "file") {
    const file = path.join(jobDir(result.jobId)!, "download", result.fileName);
    return new Response(await readFile(file), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`,
        "Cache-Control": "no-store",
      },
    });
  }
  return json({ status: "done", tool: toolSlug, result: publicResult(result) });
}
