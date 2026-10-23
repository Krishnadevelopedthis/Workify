import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";
import { alternates } from "@/i18n/seo";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t, lang } = await getT();
  return { title: t("Cookies"), alternates: alternates(lang, "/cookies") };
}

export default async function CookiesPage() {
  const { t } = await getT();
  const rows: [string, string, string][] = [
    ["wf_session", t("Keeps you logged in (only set when you log in)."), t("30 days")],
    ["wf_lang", t("Remembers the language you chose."), t("1 year")],
  ];
  return (
    <InfoPage icon="info-circle" title={t("Cookies")}>
      <div className="prose-page">
        <p>{t("Workify uses as few cookies as possible. There are no advertising or tracking cookies.")}</p>
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full text-start text-sm">
            <thead className="bg-bg">
              <tr><th className="p-3 text-start">{t("Name")}</th><th className="p-3 text-start">{t("Purpose")}</th><th className="p-3 text-start">{t("Duration")}</th></tr>
            </thead>
            <tbody>
              {rows.map(([name, purpose, duration]) => (
                <tr key={name} className="border-t border-line">
                  <td className="p-3 font-mono">{name}</td><td className="p-3">{purpose}</td><td className="p-3">{duration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h2>{t("Browser storage")}</h2>
        <p>{t("If you save a workflow without an account, it is kept in your browser's local storage on this device only.")}</p>
      </div>
    </InfoPage>
  );
}
