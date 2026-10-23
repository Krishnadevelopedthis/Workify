import { currentUser } from "@/server/auth";
import { db } from "@/server/db";

export const runtime = "nodejs";

/** Admins only: the Premium waitlist as CSV. */
export async function GET() {
  const user = await currentUser();
  if (!user?.admin) return new Response("Not found.", { status: 404 });
  const rows = db.prepare("SELECT email, lang, created_at FROM premium_waitlist ORDER BY created_at").all() as {
    email: string;
    lang: string;
    created_at: number;
  }[];
  // Quote every field; a leading = + - @ is neutralised so spreadsheets don't run it as a formula.
  const cell = (v: string) => `"${v.replace(/^[=+\-@]/, "'$&").replaceAll('"', '""')}"`;
  const csv = ["email,language,joined", ...rows.map((r) => [r.email, r.lang, new Date(r.created_at).toISOString()].map(cell).join(","))].join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="workify-premium-waitlist.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
