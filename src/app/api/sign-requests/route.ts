import { requestT } from "@/i18n/request";
import type { T } from "@/i18n/translate";
import { currentUser } from "@/server/auth";
import { clientIp, rateLimit, tooMany } from "@/server/rate-limit";
import { SignInputError, validateSignInput } from "@/server/sign-input";
import { ANON_MAX_BYTES, AnonymousLimitError, createRequest, manageLink } from "@/server/sign-requests";

export const runtime = "nodejs";

const MB = 1024 * 1024;

/** The size message, with the smaller limit for requests without an account (every translation has the "100"). */
const tooLarge = (t: T, anonymous: boolean) => {
  const message = t("The file can be at most 100 MB.");
  return Response.json({ error: anonymous ? message.replace("100", String(ANON_MAX_BYTES / MB)) : message }, { status: 413 });
};

/** Creates a signature request with one or more signers. */
export async function POST(request: Request) {
  const { t, lang } = await requestT(request.headers);
  const user = await currentUser();
  // Without an account the PDF is stored for strangers: a smaller limit (see sign-requests.ts).
  const maxBytes = user ? 100 * MB : ANON_MAX_BYTES;
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes + MB) return tooLarge(t, !user);
  // Also per account, shared with the developer API, so several IPs do not add up.
  const limited = rateLimit("signRequest", request.headers, user ? `user:${user.id}` : undefined);
  if (limited) return tooMany(t(limited));
  const form = await request.formData().catch(() => null);
  try {
    let signers: unknown;
    try {
      signers = JSON.parse(String(form?.get("signers") ?? "[]"));
    } catch {
      signers = null;
    }
    const file = form?.get("file") as File | null;
    if (!user && file instanceof File && file.size > ANON_MAX_BYTES) return tooLarge(t, true);
    const input = await validateSignInput({
      file,
      signers,
      message: form?.get("message"),
      ordered: form?.get("ordered"),
      reminderDays: form?.get("reminderDays"),
      senderName: form?.get("senderName"),
      user,
    });
    const created = await createRequest({
      ...input,
      ownerId: user?.id ?? null,
      lang,
      client: { ip: clientIp(request.headers), userAgent: request.headers.get("user-agent") },
    });
    return Response.json({
      id: created.id,
      manageLink: manageLink(created.manageToken),
      accountLink: user ? `/account/signatures/${created.id}` : null,
      signers: created.signers,
    });
  } catch (e) {
    if (e instanceof SignInputError) return Response.json({ error: t(e.template, e.vars) }, { status: 400 });
    if (e instanceof AnonymousLimitError) {
      if (e.kind === "size") return tooLarge(t, true);
      if (e.kind === "client") return tooMany(t("Too many requests. Please wait a few minutes and try again."));
      return tooMany(t("Workify is very busy right now. Please try again in a few minutes."));
    }
    throw e;
  }
}
