import { LOCALE_NAMES, LOCALE_TAGS, isLocale } from "@/i18n/config";
import { getT } from "@/i18n/server";
import { TOOL_BY_SLUG } from "@/lib/tools";
import { requireAdmin } from "@/server/admin";
import { perDay, topDevices, topLanguages, topPages, topReferrers, totals, type Row } from "@/server/page-stats";
import { AdminTitle, Card, Stat, Table, Td } from "../ui";

const DAYS = 30;
const DEVICE_LABEL: Record<string, string> = { mobile: "Mobile", tablet: "Tablet", desktop: "Desktop" };

export default async function AdminAnalytics() {
  await requireAdmin();
  const { t, lang } = await getT();
  const n = new Intl.NumberFormat(LOCALE_TAGS[lang]);
  const [month, week] = [totals(DAYS), totals(7)];
  const daily = perDay(DAYS);
  const max = Math.max(1, ...daily.map((d) => d.views));
  const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(LOCALE_TAGS[lang], { day: "numeric", month: "short", timeZone: "UTC" });

  /** Tool pages get their translated name; other paths stay as they are. */
  const pageName = (path: string) => {
    const tool = TOOL_BY_SLUG.get(path.slice(1));
    return tool ? t(tool.name) : path;
  };

  const list = (head: string, rows: Row[], label: (name: string) => string, empty: string) => (
    <div>
      <h2 className="mb-3 font-bold">{head}</h2>
      <Table head={[head, t("Visits"), t("Page views")]} empty={rows.length ? undefined : empty}>
        {rows.map((r) => (
          <tr key={r.name}>
            <Td>{label(r.name)}</Td>
            <Td>{n.format(r.visits)}</Td>
            <Td>{n.format(r.views)}</Td>
          </tr>
        ))}
      </Table>
    </div>
  );

  return (
    <div>
      <AdminTitle
        title={t("Analytics")}
        subtitle={t("Daily totals only: no cookies, no IP addresses and no record of a single visit.")}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon="users" label={t("Visits (7 days)")} value={n.format(week.visits)} />
        <Stat icon="eye" label={t("Page views (7 days)")} value={n.format(week.views)} />
        <Stat icon="users" label={t("Visits (30 days)")} value={n.format(month.visits)} />
        <Stat icon="eye" label={t("Page views (30 days)")} value={n.format(month.views)} />
      </div>

      <Card className="mb-6">
        <h2 className="mb-4 font-bold">{t("Page views per day (last 30 days)")}</h2>
        <div className="flex h-40 items-end gap-1" role="img" aria-label={t("Page views per day (last 30 days)")}>
          {daily.map((d) => (
            <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${dayLabel(d.day)}: ${n.format(d.views)}`}>
              <div className="w-full rounded-t bg-brand/80" style={{ height: `${(d.views / max) * 100}%`, minHeight: d.views ? 2 : 0 }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted">
          <span>{dayLabel(daily[0].day)}</span>
          <span>{dayLabel(daily[daily.length - 1].day)}</span>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        {list(t("Top pages"), topPages(DAYS), pageName, t("No visits yet."))}
        {list(t("Where visitors come from"), topReferrers(DAYS), (h) => h, t("Everyone came directly so far."))}
        {list(t("Languages"), topLanguages(DAYS), (l) => (isLocale(l) ? LOCALE_NAMES[l] : l), t("No visits yet."))}
        {list(t("Devices"), topDevices(DAYS), (d) => t(DEVICE_LABEL[d] ?? d), t("No visits yet."))}
      </div>
    </div>
  );
}
