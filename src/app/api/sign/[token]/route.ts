import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { requestT } from "@/i18n/request";
import { ToolError } from "@/server/engines";
import { createJob, deleteJob, saveUpload, type JobFile } from "@/server/jobs";
import { logError } from "@/server/monitor";
import { rateLimit, tooMany } from "@/server/rate-limit";
import { clientOf } from "@/server/sign-http";
import { canSign, decline, documentPath, recordSignature, signerByToken } from "@/server/sign-requests";
import { MAX_SIGNER_OVERLAYS, SIGNER_IMAGES, signerOverlays, stampSignerOverlays, withRequestLock } from "./signing";

export const runtime = "nodejs";

/**
 * A signer's actions on their personal link (multipart form):
 *   action=sign:    overlays (JSON) + extra:<key> images
 *   action=decline: reason
 */
export async function POST(request: Request, ctx: RouteContext<"/api/sign/[token]">) {
  const { t } = await requestT(request.headers);
  const err = (status: number, message: string) => Response.json({ error: message }, { status });
  const token = (await ctx.params).token;
  const found = signerByToken(token);
  if (!found) return err(404, t("This signing link is invalid or has expired."));
  const notNow = (signer: typeof found.signer) =>
    err(409, signer.status === "signed" ? t("You have already signed this document.") : t("This document can't be signed right now."));
  if (!canSign(found.request, found.signer)) return notNow(found.signer);
  if (Number(request.headers.get("content-length") ?? 0) > 25 * 1024 * 1024) return err(413, t("The signature data is too large."));
  const limited = rateLimit("signRequest", request.headers);
  if (limited) return tooMany(t(limited));
  const form = await request.formData().catch(() => null);
  if (!form) return err(400, t("The signature data could not be read."));
  const client = clientOf(request);

  // Signing and declining for one request run one at a time, and re-check the
  // signer and request from the database: two signers (or one link used twice)
  // must never read the same current.pdf and overwrite each other's signature.
  const locked = (fn: (current: NonNullable<ReturnType<typeof signerByToken>>) => Promise<Response>) =>
    withRequestLock(found.request.id, async () => {
      const current = signerByToken(token);
      if (!current) return err(404, t("This signing link is invalid or has expired."));
      if (!canSign(current.request, current.signer)) return notNow(current.signer);
      return fn(current);
    });

  if (form.get("action") === "decline") {
    return locked(async ({ request: req, signer }) => {
      if (!decline(req, signer, String(form.get("reason") ?? "").trim(), client)) return notNow(signer);
      return Response.json({ ok: true });
    });
  }

  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("overlays") ?? "[]"));
  } catch {
    return err(400, t("The signature data could not be read."));
  }
  if (!Array.isArray(raw) || !raw.length) return err(400, t("Place your signature on the document first."));
  if (raw.length > MAX_SIGNER_OVERLAYS) return err(400, t("Too many items on the document."));
  const overlays = signerOverlays(raw);
  if (!overlays) return err(400, t("The signature data could not be read."));

  const job = await createJob();
  try {
    const extras: Record<string, JobFile> = {};
    let i = 0;
    for (const [key, value] of form.entries()) {
      if (key.startsWith("extra:") && SIGNER_IMAGES.has(key.slice(6)) && value instanceof File && value.size < 10 * 1024 * 1024) {
        extras[key.slice(6)] = await saveUpload(job, value, i++);
      }
    }
    return await locked(async ({ request: req, signer }) => {
      const doc = await PDFDocument.load(await readFile(documentPath(req, "current")!));
      await stampSignerOverlays({ extras }, doc, overlays);
      await recordSignature(req, signer, await doc.save(), client);
      return Response.json({ ok: true });
    });
  } catch (e) {
    if (e instanceof ToolError) return err(400, t(e.template, e.vars));
    logError("sign", "Signing failed", e);
    return err(500, t("Signing failed. Please try again."));
  } finally {
    await deleteJob(job.id);
  }
}
