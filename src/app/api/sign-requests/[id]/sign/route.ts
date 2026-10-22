import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { ToolError } from "@/server/engines";
import { createJob, deleteJob, saveUpload, type JobFile } from "@/server/jobs";
import { applyOverlays, type Overlay } from "@/server/processors";
import { rateLimit, tooMany } from "@/server/rate-limit";
import { getRequest, markSigned, requestDir } from "@/server/sign-requests";

export const runtime = "nodejs";

/** The signer submits their placed signature; the signed PDF is stored for the owner. */
export async function POST(request: Request, ctx: RouteContext<"/api/sign-requests/[id]/sign">) {
  const { id } = await ctx.params;
  const req = getRequest(id);
  const dir = requestDir(id);
  if (!req || !dir) return Response.json({ error: "This signing link is invalid or has expired." }, { status: 404 });
  if (req.status === "signed") return Response.json({ error: "This document has already been signed." }, { status: 409 });
  if (Number(request.headers.get("content-length") ?? 0) > 25 * 1024 * 1024) {
    return Response.json({ error: "The signature data is too large." }, { status: 413 });
  }
  const limited = rateLimit("signRequest", request.headers);
  if (limited) return tooMany(limited);

  const form = await request.formData().catch(() => null);
  let overlays: Overlay[];
  try {
    overlays = JSON.parse(String(form?.get("overlays") ?? "[]"));
  } catch {
    return Response.json({ error: "The signature data could not be read." }, { status: 400 });
  }
  if (!Array.isArray(overlays) || !overlays.length) {
    return Response.json({ error: "Place your signature on the document first." }, { status: 400 });
  }
  if (overlays.length > 200) return Response.json({ error: "Too many items on the document." }, { status: 400 });

  const job = await createJob();
  try {
    const extras: Record<string, JobFile> = {};
    let i = 0;
    for (const [key, value] of form!.entries()) {
      if (key.startsWith("extra:") && value instanceof File && value.size < 10 * 1024 * 1024) {
        extras[key.slice(6)] = await saveUpload(job, value, i++);
      }
    }
    const doc = await PDFDocument.load(await readFile(path.join(dir, "original.pdf")));
    await applyOverlays({ extras }, doc, overlays);
    await writeFile(path.join(dir, "signed.pdf"), await doc.save());
    markSigned(id);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof ToolError) return Response.json({ error: e.message }, { status: 400 });
    console.error("[sign-request]", e);
    return Response.json({ error: "Signing failed. Please try again." }, { status: 500 });
  } finally {
    await deleteJob(job.id);
  }
}
