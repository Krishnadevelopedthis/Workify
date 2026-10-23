import { requestT } from "@/i18n/request";
import { currentUser } from "@/server/auth";
import { clientIp, rateLimit, tooMany } from "@/server/rate-limit";
import { SignInputError, validateSignInput } from "@/server/sign-input";
import { createRequest, manageLink } from "@/server/sign-requests";

export const runtime = "nodejs";

/** Creates a signature request with one or more signers. */
export async function POST(request: Request) {
  const { t, lang } = await requestT(request.headers);
  if (Number(request.headers.get("content-length") ?? 0) > 101 * 1024 * 1024) {
    return Response.json({ error: t("The file can be at most 100 MB.") }, { status: 413 });
  }
  const limited = rateLimit("signRequest", request.headers);
  if (limited) return tooMany(t(limited));
  const form = await request.formData().catch(() => null);
  const user = await currentUser();
  try {
    let signers: unknown;
    try {
      signers = JSON.parse(String(form?.get("signers") ?? "[]"));
    } catch {
      signers = null;
    }
    const input = await validateSignInput({
      file: form?.get("file") as File | null,
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
    throw e;
  }
}
