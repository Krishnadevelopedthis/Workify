import { currentUser } from "@/server/auth";
import { ensureScheduler } from "@/server/scheduler";

export const runtime = "nodejs";

/** Who is logged in, for the header. Never cached: it is per-user. */
export async function GET() {
  ensureScheduler();
  const user = await currentUser();
  return Response.json(
    { user: user && { name: user.name, email: user.email, admin: user.admin, verified: user.verified } },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
