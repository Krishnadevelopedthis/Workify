import { EngineMissingError, python, ToolError } from "@/server/engines";
import { createJob, deleteJob, saveUpload } from "@/server/jobs";
import { BusyError, heavyGate, rateLimit, tooMany } from "@/server/rate-limit";

export const runtime = "nodejs";

/** Finds likely form fields (blank lines, "Label:" text, checkboxes) in a PDF. */
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 210 * 1024 * 1024) {
    return Response.json({ error: "The file is too large." }, { status: 413 });
  }
  const limited = rateLimit("light", request.headers);
  if (limited) return tooMany(limited);
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Upload a PDF." }, { status: 400 });
  if (file.size > 200 * 1024 * 1024) return Response.json({ error: "The file is too large." }, { status: 413 });

  const job = await createJob();
  try {
    const saved = await saveUpload(job, file, 0);
    const result = await heavyGate.run(() => python("detect-fields", [saved.path]));
    return Response.json({ fields: result.fields ?? [] });
  } catch (e) {
    if (e instanceof ToolError) return Response.json({ error: e.message }, { status: 400 });
    if (e instanceof EngineMissingError || e instanceof BusyError) return Response.json({ error: e.message }, { status: 503 });
    console.error("[detect-fields]", e);
    return Response.json({ error: "Field detection failed." }, { status: 500 });
  } finally {
    await deleteJob(job.id);
  }
}
