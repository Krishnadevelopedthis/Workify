import { PDFDocument } from "pdf-lib";
import { currentUser } from "@/server/auth";
import { safeName } from "@/server/jobs";
import { rateLimit, tooMany } from "@/server/rate-limit";
import { createRequest } from "@/server/sign-requests";

export const runtime = "nodejs";

/** Creates a shareable "please sign this" link for a PDF. */
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 101 * 1024 * 1024) {
    return Response.json({ error: "The file can be at most 100 MB." }, { status: 413 });
  }
  const limited = rateLimit("signRequest", request.headers);
  if (limited) return tooMany(limited);
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const signerName = String(form?.get("signerName") ?? "").trim().slice(0, 100);
  const message = String(form?.get("message") ?? "").trim().slice(0, 500);
  if (!(file instanceof File)) return Response.json({ error: "Upload a PDF." }, { status: 400 });
  if (!signerName) return Response.json({ error: "Enter the signer's name." }, { status: 400 });
  if (file.size > 100 * 1024 * 1024) return Response.json({ error: "The file can be at most 100 MB." }, { status: 413 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    await PDFDocument.load(bytes); // reject non-PDFs and locked PDFs up front
  } catch {
    return Response.json({ error: "This file is not a valid, unlocked PDF." }, { status: 400 });
  }
  const user = await currentUser();
  const id = await createRequest({ ownerId: user?.id ?? null, fileName: safeName(file.name), signerName, message, bytes });
  return Response.json({ id });
}
