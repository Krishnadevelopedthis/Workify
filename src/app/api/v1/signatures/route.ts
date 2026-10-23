import { isLocale } from "@/i18n/config";
import { ApiError, authenticate } from "@/server/api";
import { clientOf } from "@/server/sign-http";
import { SignInputError, validateSignInput } from "@/server/sign-input";
import { createRequest, requestsForUser } from "@/server/sign-requests";
import { handle, json } from "../_lib";
import { requestJson } from "./shared";

export const runtime = "nodejs";

/** Your signature requests, newest first. */
export async function GET(request: Request) {
  return handle(async () => {
    const user = authenticate(request);
    return json({ requests: requestsForUser(user.id).map((r) => requestJson(r)) });
  });
}

/**
 * Sends a PDF for signature. multipart/form-data:
 *   file, signers (JSON [{ "name", "email" }]), message, ordered ("true"),
 *   reminder_days (0, 1, 2, 3 or 7), lang (email language, default "en").
 * Signers with an email address are invited by email; every signer's
 * personal link is also returned.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const user = authenticate(request);
    const form = await request.formData().catch(() => {
      throw new ApiError(400, "Send the request as multipart/form-data.");
    });
    let signers: unknown;
    try {
      signers = JSON.parse(String(form.get("signers") ?? "[]"));
    } catch {
      throw new ApiError(400, "`signers` must be a JSON array.");
    }
    try {
      const input = await validateSignInput({
        file: form.get("file") as File | null,
        signers,
        message: form.get("message"),
        ordered: form.get("ordered"),
        reminderDays: form.get("reminder_days"),
        senderName: user.name,
        user,
      });
      const lang = String(form.get("lang") ?? "en");
      const created = await createRequest({
        ...input,
        ownerId: user.id,
        lang: isLocale(lang) ? lang : "en",
        client: clientOf(request),
      });
      const origin = new URL(request.url).origin;
      return json({
        id: created.id,
        status: "pending",
        signers: created.signers.map((s) => ({ ...s, link: `${origin}${s.link}` })),
      }, 201);
    } catch (e) {
      if (e instanceof SignInputError) throw new ApiError(400, e.message);
      throw e;
    }
  });
}
