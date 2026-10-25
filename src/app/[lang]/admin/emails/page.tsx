import { resendEmail } from "@/app/actions/admin";
import { LOCALE_TAGS } from "@/i18n/config";
import { getT } from "@/i18n/server";
import { requireAdmin } from "@/server/admin";
import { db } from "@/server/db";
import { isRedacted, outboxPreview, smtpConfigured } from "@/server/mail";
import { ActionButton } from "../ActionButton";
import { AdminTitle, fmtDate, Table, Td } from "../ui";

type Row = { id: number; to_email: string; subject: string; text: string; status: string; attempts: number; error: string | null; created_at: number };

const TONE: Record<string, string> = {
  sent: "bg-[#6aa84f]/15 text-[#4a8a32]",
  queued: "bg-[#f1b800]/15 text-[#a07a00]",
  failed: "bg-brand/10 text-brand",
  logged: "bg-bg text-muted",
};

export default async function AdminEmails({ searchParams }: PageProps<"/[lang]/admin/emails">) {
  await requireAdmin();
  const { t, lang } = await getT();
  const status = String((await searchParams).status ?? "");
  const rows = db
    .prepare(`SELECT id, to_email, subject, text, status, attempts, error, created_at FROM outbox ${status ? "WHERE status = ?" : ""} ORDER BY id DESC LIMIT 200`)
    .all(...(status ? [status] : [])) as Row[];
  return (
    <div>
      <AdminTitle
        title={t("Emails")}
        subtitle={smtpConfigured() ? t("Every email Workify sent or tried to send, newest first.") : t("SMTP is not configured: emails are stored here instead of being sent. Open one to copy its link.")}
        action={
          <div className="flex gap-2 text-sm">
            {["", "queued", "failed", "sent", "logged"].map((s) => (
              <a key={s} href={s ? `?status=${s}` : "?"} className={`rounded-full px-3 py-1 ${status === s ? "bg-ink text-white" : "bg-white"}`}>
                {s || t("All")}
              </a>
            ))}
          </div>
        }
      />
      <Table head={[t("To"), t("Subject"), t("Status"), t("Created"), ""]} empty={rows.length ? undefined : t("No emails.")}>
        {rows.map((r) => (
          <tr key={r.id}>
            <Td className="font-mono text-xs">{r.to_email}</Td>
            <Td>
              <details>
                <summary className="cursor-pointer">{r.subject}</summary>
                <pre className="mt-2 max-w-xl text-xs whitespace-pre-wrap text-muted">{outboxPreview(r)}</pre>
              </details>
              {r.error && <p className="mt-1 text-xs text-brand">{r.error}</p>}
            </Td>
            <Td>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[r.status]}`}>{r.status}</span>
              {r.attempts > 1 && <span className="ms-1 text-xs text-muted">×{r.attempts}</span>}
            </Td>
            <Td>{fmtDate(r.created_at, LOCALE_TAGS[lang])}</Td>
            <Td>{r.status !== "sent" && !isRedacted(r) && <ActionButton action={resendEmail.bind(null, r.id)}>{t("Send again")}</ActionButton>}</Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
