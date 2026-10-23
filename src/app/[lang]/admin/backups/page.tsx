import { backupNow } from "@/app/actions/admin";
import { LOCALE_TAGS } from "@/i18n/config";
import { getT } from "@/i18n/server";
import { requireAdmin } from "@/server/admin";
import { listBackups } from "@/server/backup";
import { ActionButton } from "../ActionButton";
import { AdminTitle, Card, fmtBytes, fmtDate, Table, Td } from "../ui";

export default async function AdminBackups() {
  await requireAdmin();
  const { t, lang } = await getT();
  const backups = await listBackups();
  return (
    <div className="space-y-6">
      <AdminTitle
        title={t("Backups")}
        subtitle={t("A copy of the database is made every day; the newest 14 are kept (WORKIFY_BACKUP_KEEP).")}
        action={<ActionButton action={backupNow}>{t("Back up now")}</ActionButton>}
      />
      <Table head={[t("File"), t("Size"), t("Created"), ""]} empty={backups.length ? undefined : t("No backups yet.")}>
        {backups.map((b) => (
          <tr key={b.name}>
            <Td className="font-mono text-xs">{b.name}</Td>
            <Td>{fmtBytes(b.size)}</Td>
            <Td>{fmtDate(b.at, LOCALE_TAGS[lang])}</Td>
            <Td><a className="text-sm font-semibold text-brand" href={`/api/admin/backups/${b.name}`}>{t("Download")}</a></Td>
          </tr>
        ))}
      </Table>
      <Card>
        <h2 className="font-bold">{t("Keep a copy somewhere else")}</h2>
        <p className="mt-1 text-sm text-muted">
          {t("Backups live on the same disk as the app. Download one regularly, or copy the data/backups folder to other storage, e.g. with rclone in a daily cron job (see DEPLOY.md). Signature files are in data/signatures.")}
        </p>
      </Card>
    </div>
  );
}
