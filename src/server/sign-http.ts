import "server-only";
import { readFile } from "node:fs/promises";
import { clientIp } from "./rate-limit";
import { documentPath, type SignRequest } from "./sign-requests";

// Small helpers for the signing routes.

export const clientOf = (request: Request) => ({
  ip: clientIp(request.headers),
  userAgent: request.headers.get("user-agent"),
});

/** Streams the current or final PDF of a request. */
export async function pdfResponse(r: SignRequest, which: "current" | "final", disposition: "inline" | "attachment") {
  const file = documentPath(r, which);
  if (!file) return new Response("Not available.", { status: 404 });
  const name = which === "final" ? r.file_name.replace(/\.pdf$/i, "") + "_signed.pdf" : r.file_name;
  return new Response(await readFile(file), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
