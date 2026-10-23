import { LOCALE_TAGS } from "@/i18n/config";
import { getT } from "@/i18n/server";
import { requireAdmin } from "@/server/admin";
import { db } from "@/server/db";
import { AdminTitle, fmtDate, Table, Td } from "../ui";

export default async function AdminWaitlist() {
  await requireAdmin();
  const { t, lang } = await getT();
  const rows = db.prepare("SELECT email, lang, created_at FROM premium_waitlist ORDER BY created_at DESC").all() as {
    email: string;
    lang: string;
    created_at: number;
  }[];
  return (
    <div>
      <AdminTitle
        title={t("Premium waitlist")}
        subtitle={t("{n} people asked to be told when Premium launches.", { n: rows.length })}
        action={
          rows.length > 0 && (
            <a href="/api/admin/waitlist" download className="btn-secondary !py-1.5 text-sm">{t("Download CSV")}</a>
          )
        }
      />
      <Table head={[t("Email"), t("Language"), t("Joined")]} empty={rows.length ? undefined : t("Nobody yet.")}>
        {rows.map((r) => (
          <tr key={r.email}>
            <Td className="font-mono text-xs">{r.email}</Td>
            <Td>{r.lang}</Td>
            <Td>{fmtDate(r.created_at, LOCALE_TAGS[lang])}</Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
