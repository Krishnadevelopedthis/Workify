import { currentUser } from "@/server/auth";

export const runtime = "nodejs";

/** Who is logged in, for the header. Never cached: it is per-user. */
export async function GET() {
  const user = await currentUser();
  return Response.json(
    { user: user && { name: user.name, email: user.email } },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
