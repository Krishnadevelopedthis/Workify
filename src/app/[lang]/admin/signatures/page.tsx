import { requestStatus, StatusBadge } from "@/components/sign/RequestDetail";
import { LOCALE_TAGS } from "@/i18n/config";
import { getT } from "@/i18n/server";
import { requireAdmin } from "@/server/admin";
import { db } from "@/server/db";
import type { SignRequest } from "@/server/sign-requests";
import { AdminTitle, fmtDate, Table, Td } from "../ui";

type Row = SignRequest & { owner_email: string | null; signers: number; signed: number };

export default async function AdminSignatures() {
  await requireAdmin();
  const { t, lang } = await getT();
  const rows = db
    .prepare(
      `SELECT r.*, u.email AS owner_email,
         (SELECT COUNT(*) FROM signers s WHERE s.request_id = r.id) AS signers,
         (SELECT COUNT(*) FROM signers s WHERE s.request_id = r.id AND s.status = 'signed') AS signed
       FROM sign_requests r LEFT JOIN users u ON u.id = r.owner_id ORDER BY r.created_at DESC LIMIT 200`,
    )
    .all() as Row[];
  const tag = LOCALE_TAGS[lang];
  return (
    <div>
      <AdminTitle title={t("Signatures")} subtitle={t("Requests are deleted with their files 30 days after they were sent.")} />
      <Table head={[t("Document"), t("Sender"), t("Progress"), t("Status"), t("Created"), t("Expires")]} empty={rows.length ? undefined : t("No signature requests.")}>
        {rows.map((r) => (
          <tr key={r.id}>
            <Td className="max-w-64 truncate font-semibold">{r.file_name}</Td>
            <Td>
              {r.sender_name}
              <p className="text-xs text-muted">{r.owner_email ?? t("no account")}</p>
            </Td>
            <Td>{r.signed} / {r.signers}</Td>
            <Td><StatusBadge status={requestStatus(r)} t={t} /></Td>
            <Td>{fmtDate(r.created_at, tag)}</Td>
            <Td>{fmtDate(r.expires_at, tag)}</Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
