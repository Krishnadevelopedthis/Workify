import { readFile } from "node:fs/promises";
import path from "node:path";
import { TOOL_BY_SLUG } from "@/lib/tools";
import { ApiError, authenticate, publicResult, startTask } from "@/server/api";
import { jobDir } from "@/server/jobs";
import { checkTool, LIMITS, runTask, validateTask } from "@/server/run-task";
import { validateWebhookUrl } from "@/server/webhooks";
import { handle, json } from "../../_lib";

export const runtime = "nodejs";
export const maxDuration = 900;

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
    if (Number(request.headers.get("content-length") ?? 0) > LIMITS.maxTotal + 10 * 1024 * 1024) {
      throw new ApiError(413, "All files together can be at most 500 MB.");
    }
    const form = await request.formData().catch(() => {
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
      const id = startTask(user, input, webhookUrl);
      return json({ id, status: "queued", tool: tool.slug, status_url: `/api/v1/tasks/${id}` }, 202);
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
    return json({ status: "done", tool: tool.slug, result: publicResult(result) });
  });
}
