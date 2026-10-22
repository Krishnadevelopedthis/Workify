import os from "node:os";
import { createJob } from "@/server/jobs";
import { rateLimit, tooMany } from "@/server/rate-limit";

export const runtime = "nodejs";

/** A non-loopback IPv4 address, so a phone on the same Wi-Fi can reach a dev server. */
function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) if (a.family === "IPv4" && !a.internal) return a.address;
  }
  return null;
}

/** Starts a scan session: the phone uploads photos to it, the computer polls it. */
export async function POST(request: Request) {
  const limited = rateLimit("light", request.headers);
  if (limited) return tooMany(limited);
  const job = await createJob();
  const url = new URL(request.url);
  const host = url.hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const lan = isLocal ? lanAddress() : null;
  const origin = lan ? `${url.protocol}//${lan}${url.port ? `:${url.port}` : ""}` : url.origin;
  return Response.json({ id: job.id, phoneUrl: `${origin}/scan-to-pdf?session=${job.id}` });
}
