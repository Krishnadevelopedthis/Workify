import { readdir, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { jobDir } from "@/server/jobs";
import { rateLimit, tooMany } from "@/server/rate-limit";

export const runtime = "nodejs";

const MAX_PAGES = 60;
const MAX_PAGE_BYTES = 15 * 1024 * 1024;
const MAX_SESSION_BYTES = 250 * 1024 * 1024;

async function images(dir: string) {
  try {
    return (await readdir(path.join(dir, "in"))).filter((n) => n.endsWith(".jpg")).sort();
  } catch {
    return null;
  }
}

/** Phone -> server: one scanned page per request. */
export async function POST(request: Request, ctx: RouteContext<"/api/scan/[id]">) {
  const { id } = await ctx.params;
  if (Number(request.headers.get("content-length") ?? 0) > MAX_PAGE_BYTES + 1024 * 1024) {
    return Response.json({ error: "Each photo can be at most 15 MB." }, { status: 413 });
  }
  const limited = rateLimit("light", request.headers);
  if (limited) return tooMany(limited);

  const dir = jobDir(id);
  const existing = dir ? await images(dir) : null;
  if (!dir || !existing) return Response.json({ error: "This scan session has expired. Scan the QR code again." }, { status: 404 });
  if (existing.length >= MAX_PAGES) return Response.json({ error: `A scan can have at most ${MAX_PAGES} pages.` }, { status: 400 });
  let used = 0;
  for (const n of existing) used += (await stat(path.join(dir, "in", n))).size;

  const form = await request.formData().catch(() => null);
  const file = form?.get("page");
  if (!(file instanceof File) || !file.type.startsWith("image/") || file.size > MAX_PAGE_BYTES) {
    return Response.json({ error: "Send one photo (max 15 MB)." }, { status: 400 });
  }
  if (used + file.size > MAX_SESSION_BYTES) return Response.json({ error: "This scan is too large. Create the PDF and start a new scan." }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer());
  // Only store real JPEG/PNG data, whatever the client claims the type is.
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
  if (!isJpeg && !isPng) return Response.json({ error: "Only JPG and PNG photos are supported." }, { status: 400 });

  const name = `${String(Date.now())}_${String(existing.length + 1).padStart(3, "0")}.jpg`;
  await writeFile(path.join(dir, "in", name), bytes);
  await utimes(dir, new Date(), new Date()); // keep an active session from being swept
  return Response.json({ ok: true, count: existing.length + 1 });
}

/** Computer -> server: which pages have arrived so far. */
export async function GET(_request: Request, ctx: RouteContext<"/api/scan/[id]">) {
  const { id } = await ctx.params;
  const dir = jobDir(id);
  const list = dir ? await images(dir) : null;
  if (!list) return Response.json({ error: "Session expired." }, { status: 404 });
  return Response.json({ pages: list.map((n) => `/api/scan/${id}/${n}`) }, { headers: { "Cache-Control": "no-store" } });
}
