import { db } from "@/server/db";
import { engines } from "@/server/engines";
import { ensureScheduler } from "@/server/scheduler";

export const runtime = "nodejs";

/**
 * For uptime monitors: 200 when the database answers, 503 otherwise.
 * ?engines=1 also reports which PDF engines are installed.
 */
export async function GET(request: Request) {
  ensureScheduler();
  let database = false;
  try {
    database = Boolean(db.prepare("SELECT 1 AS ok").get());
  } catch {
    database = false;
  }
  const body: Record<string, unknown> = { status: database ? "ok" : "error", database };
  if (new URL(request.url).searchParams.get("engines") === "1") {
    body.engines = {
      ghostscript: Boolean(engines.ghostscript),
      qpdf: Boolean(engines.qpdf),
      libreoffice: Boolean(engines.soffice),
      tesseract: Boolean(engines.tesseractDir),
      python: Boolean(engines.python),
    };
  }
  return Response.json(body, { status: database ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
