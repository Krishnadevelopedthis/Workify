import { HoverLink } from "@/components/HoverLink";
import { Icon } from "@/components/Icon";
import { LOCALE_TAGS } from "@/i18n/config";
import { getT } from "@/i18n/server";
import { TOOL_BY_SLUG } from "@/lib/tools";
import { dashboardStats, requireAdmin } from "@/server/admin";
import { smtpConfigured } from "@/server/mail";
import { AdminTitle, Card, fmtBytes, Stat, Table, Td } from "./ui";

/** Label of bar `i` in the 14-day chart (0 = 13 days ago). */
function dayLabel(i: number, tag: string) {
  return new Date(Date.now() - (13 - i) * 86_400_000).toLocaleDateString(tag, { day: "numeric", month: "short" });
}

export default async function AdminDashboard() {
  await requireAdmin();
  const { t, lang } = await getT();
  const s = await dashboardStats();
  const max = Math.max(1, ...s.daily);
  const day = (i: number) => dayLabel(i, LOCALE_TAGS[lang]);

  const alerts: { href: string; text: string }[] = [];
  if (!smtpConfigured()) alerts.push({ href: "/admin/system", text: t("SMTP is not configured: emails are kept in the outbox instead of being sent.") });
  if (s.failedEmails) alerts.push({ href: "/admin/emails", text: t("{n} email(s) could not be sent.", { n: s.failedEmails }) });
  if (s.errors24h) alerts.push({ href: "/admin/errors", text: t("{n} error(s) in the last 24 hours.", { n: s.errors24h }) });
  if (s.openMessages) alerts.push({ href: "/admin/messages", text: t("{n} contact message(s) waiting for a reply.", { n: s.openMessages }) });
  if (s.disk && s.disk.free / s.disk.total < 0.1) alerts.push({ href: "/admin/system", text: t("Less than 10% disk space left.") });

  return (
    <div className="space-y-6">
      <AdminTitle title={t("Dashboard")} />
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a) => (
            <HoverLink key={a.text} href={a.href} className="flex items-center gap-2 rounded-xl border border-[#f1b800]/40 bg-[#f1b800]/10 px-4 py-2.5 text-sm hover:underline">
              <Icon name="alert-triangle" size={18} className="text-[#a07a00]" /> {a.text}
            </HoverLink>
          ))}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon="users" label={t("Users ({verified} verified, +{new} this week)", { verified: s.verifiedUsers, new: s.newUsers7d })} value={s.users} />
        <Stat icon="bolt" label={t("Tasks in 24 h ({failed} failed)", { failed: s.failed24h })} value={s.tasks24h} tone={s.failed24h ? "warn" : undefined} />
        <Stat icon="signature" label={t("Signature requests in progress ({done} completed)", { done: s.completedSignatures })} value={s.pendingSignatures} />
        <Stat icon="code" label={t("API tasks this week ({keys} active keys)", { keys: s.apiKeys })} value={s.apiTasks7d} />
        <Stat icon="inbox" label={t("Unanswered messages")} value={s.openMessages} tone={s.openMessages ? "warn" : undefined} />
        <Stat icon="mail" label={t("Emails queued / failed / not sent (no SMTP)")} value={`${s.queuedEmails} / ${s.failedEmails} / ${s.loggedEmails}`} tone={s.failedEmails ? "bad" : undefined} />
        <Stat icon="alert-circle" label={t("Errors in 24 h")} value={s.errors24h} tone={s.errors24h ? "bad" : undefined} />
        <Stat icon="crown" label={t("Premium waitlist")} value={s.waitlist} />
      </div>

      <Card>
        <h2 className="mb-4 font-bold">{t("Tasks per day (last 14 days)")}</h2>
        <div className="flex h-40 items-end gap-1.5" role="img" aria-label={t("Tasks per day (last 14 days)")}>
          {s.daily.map((n, i) => (
            <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${day(i)}: ${n}`}>
              <span className="text-[10px] text-muted">{n || ""}</span>
              <div className="w-full rounded-t bg-brand/80" style={{ height: `${(n / max) * 100}%`, minHeight: n ? 2 : 0 }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted">
          <span>{day(0)}</span>
          <span>{day(13)}</span>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <h2 className="mb-3 font-bold">{t("Most used tools (7 days)")}</h2>
          <Table head={[t("Tool"), t("Tasks"), t("Failed"), t("Average time")]} empty={s.tasksByTool.length ? undefined : t("No tasks yet.")}>
            {s.tasksByTool.map((r) => (
              <tr key={r.tool}>
                <Td>{t(TOOL_BY_SLUG.get(r.tool)?.name ?? r.tool)}</Td>
                <Td>{r.n}</Td>
                <Td className={r.failed ? "text-brand" : ""}>{r.failed}</Td>
                <Td>{(r.avg_ms / 1000).toFixed(1)} s</Td>
              </tr>
            ))}
          </Table>
        </div>
        <Card>
          <h2 className="mb-3 font-bold">{t("Disk")}</h2>
          {s.disk ? (
            <>
              <div className="h-3 overflow-hidden rounded-full bg-bg">
                <div className="h-full bg-brand" style={{ width: `${100 - (s.disk.free / s.disk.total) * 100}%` }} />
              </div>
              <p className="mt-2 text-sm text-muted">{t("{free} free of {total}", { free: fmtBytes(s.disk.free), total: fmtBytes(s.disk.total) })}</p>
            </>
          ) : (
            <p className="text-sm text-muted">—</p>
          )}
        </Card>
      </div>
    </div>
  );
}
