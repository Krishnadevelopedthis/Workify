import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { requestT } from "@/i18n/request";
import { ToolError } from "@/server/engines";
import { createJob, deleteJob, saveUpload, type JobFile } from "@/server/jobs";
import { logError } from "@/server/monitor";
import { applyOverlays, type Overlay } from "@/server/processors";
import { rateLimit, tooMany } from "@/server/rate-limit";
import { clientOf } from "@/server/sign-http";
import { canSign, decline, documentPath, recordSignature, signerByToken } from "@/server/sign-requests";

export const runtime = "nodejs";

/**
 * A signer's actions on their personal link (multipart form):
 *   action=sign:    overlays (JSON) + extra:<key> images
 *   action=decline: reason
 */
export async function POST(request: Request, ctx: RouteContext<"/api/sign/[token]">) {
  const { t } = await requestT(request.headers);
  const err = (status: number, message: string) => Response.json({ error: message }, { status });
  const found = signerByToken((await ctx.params).token);
  if (!found) return err(404, t("This signing link is invalid or has expired."));
  const { request: req, signer } = found;
  if (!canSign(req, signer)) {
    return err(409, signer.status === "signed" ? t("You have already signed this document.") : t("This document can't be signed right now."));
  }
  if (Number(request.headers.get("content-length") ?? 0) > 25 * 1024 * 1024) return err(413, t("The signature data is too large."));
  const limited = rateLimit("signRequest", request.headers);
  if (limited) return tooMany(t(limited));
  const form = await request.formData().catch(() => null);
  if (!form) return err(400, t("The signature data could not be read."));
  const client = clientOf(request);

  if (form.get("action") === "decline") {
    decline(req, signer, String(form.get("reason") ?? "").trim(), client);
    return Response.json({ ok: true });
  }

  let overlays: Overlay[];
  try {
    overlays = JSON.parse(String(form.get("overlays") ?? "[]"));
  } catch {
    return err(400, t("The signature data could not be read."));
  }
  if (!Array.isArray(overlays) || !overlays.length) return err(400, t("Place your signature on the document first."));
  if (overlays.length > 200) return err(400, t("Too many items on the document."));

  const job = await createJob();
  try {
    const extras: Record<string, JobFile> = {};
    let i = 0;
    for (const [key, value] of form.entries()) {
      if (key.startsWith("extra:") && value instanceof File && value.size < 10 * 1024 * 1024) {
        extras[key.slice(6)] = await saveUpload(job, value, i++);
      }
    }
    const doc = await PDFDocument.load(await readFile(documentPath(req, "current")!));
    await applyOverlays({ extras }, doc, overlays);
    await recordSignature(req, signer, await doc.save(), client);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof ToolError) return err(400, t(e.template, e.vars));
    logError("sign", "Signing failed", e);
    return err(500, t("Signing failed. Please try again."));
  } finally {
    await deleteJob(job.id);
  }
}
