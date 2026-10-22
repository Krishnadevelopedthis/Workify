import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { jobDir, safeName } from "@/server/jobs";

export const runtime = "nodejs";

const TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".jpg": "image/jpeg",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".md": "text/markdown; charset=utf-8",
};

export async function GET(request: Request, ctx: RouteContext<"/api/download/[job]/[file]">) {
  const { job, file } = await ctx.params;
  const dir = jobDir(job);
  const name = safeName(decodeURIComponent(file));
  if (!dir) return new Response("Not found", { status: 404 });
  const filePath = path.join(dir, "download", name);
  let size: number;
  try {
    size = (await stat(filePath)).size;
  } catch {
    return new Response("This file has expired or was deleted.", { status: 404 });
  }
  const inline = new URL(request.url).searchParams.get("inline") === "1";
  const type = TYPES[path.extname(name).toLowerCase()] ?? "application/octet-stream";
  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  return new Response(stream, {
    headers: {
      "Content-Type": type,
      "Content-Length": String(size),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
