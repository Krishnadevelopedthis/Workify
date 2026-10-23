import { deleteMessage, setMessageHandled } from "@/app/actions/admin";
import { LOCALE_TAGS } from "@/i18n/config";
import { getT } from "@/i18n/server";
import { requireAdmin } from "@/server/admin";
import { db } from "@/server/db";
import { ActionButton } from "../ActionButton";
import { AdminTitle, Card, fmtDate } from "../ui";
import { ReplyForm } from "./ReplyForm";

type Msg = { id: number; name: string; email: string; subject: string; message: string; created_at: number; handled_at: number | null; lang: string };

export default async function AdminMessages({ searchParams }: PageProps<"/[lang]/admin/messages">) {
  await requireAdmin();
  const { t, lang } = await getT();
  const all = (await searchParams).all === "1";
  const rows = db
    .prepare(`SELECT * FROM contact_messages ${all ? "" : "WHERE handled_at IS NULL"} ORDER BY created_at DESC LIMIT 200`)
    .all() as Msg[];
  return (
    <div>
      <AdminTitle
        title={t("Messages")}
        subtitle={all ? t("All contact messages") : t("Messages waiting for a reply")}
        action={<a className="text-sm font-semibold text-brand" href={all ? "?" : "?all=1"}>{all ? t("Show open only") : t("Show all")}</a>}
      />
      {rows.length === 0 && <Card><p className="text-center text-sm text-muted">{t("No messages.")}</p></Card>}
      <div className="space-y-4">
        {rows.map((m) => (
          <Card key={m.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{m.subject} · {m.name} <span className="font-normal text-muted">&lt;{m.email}&gt;</span></p>
                <p className="text-xs text-muted">{fmtDate(m.created_at, LOCALE_TAGS[lang])} · {m.lang}{m.handled_at ? ` · ${t("handled")}` : ""}</p>
              </div>
              <div className="flex gap-1.5">
                <ActionButton action={setMessageHandled.bind(null, m.id, !m.handled_at)}>
                  {m.handled_at ? t("Reopen") : t("Mark handled")}
                </ActionButton>
                <ActionButton action={deleteMessage.bind(null, m.id)} confirmText="Delete this message?" danger>{t("Delete")}</ActionButton>
              </div>
            </div>
            <p className="mt-3 text-sm whitespace-pre-wrap">{m.message}</p>
            {!m.handled_at && <ReplyForm id={m.id} />}
          </Card>
        ))}
      </div>
    </div>
  );
}
