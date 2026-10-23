import { clearErrors } from "@/app/actions/admin";
import { LOCALE_TAGS } from "@/i18n/config";
import { getT } from "@/i18n/server";
import { requireAdmin } from "@/server/admin";
import { db } from "@/server/db";
import { ActionButton } from "../ActionButton";
import { AdminTitle, fmtDate, Table, Td } from "../ui";

type Row = { id: number; source: string; message: string; detail: string | null; at: number };

export default async function AdminErrors() {
  await requireAdmin();
  const { t, lang } = await getT();
  const rows = db.prepare("SELECT * FROM error_log ORDER BY id DESC LIMIT 300").all() as Row[];
  return (
    <div>
      <AdminTitle
        title={t("Errors")}
        subtitle={t("Server errors from the last 30 days. Admins get at most one email digest per hour.")}
        action={rows.length > 0 && <ActionButton action={clearErrors} confirmText="Clear the error log?" danger>{t("Clear log")}</ActionButton>}
      />
      <Table head={[t("When"), t("Where"), t("Message")]} empty={rows.length ? undefined : t("No errors. 🎉")}>
        {rows.map((e) => (
          <tr key={e.id}>
            <Td className="whitespace-nowrap">{fmtDate(e.at, LOCALE_TAGS[lang])}</Td>
            <Td className="font-mono text-xs">{e.source}</Td>
            <Td>
              {e.detail ? (
                <details>
                  <summary className="cursor-pointer">{e.message}</summary>
                  <pre className="mt-2 max-w-3xl overflow-x-auto text-xs whitespace-pre-wrap text-muted">{e.detail}</pre>
                </details>
              ) : (
                e.message
              )}
            </Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
