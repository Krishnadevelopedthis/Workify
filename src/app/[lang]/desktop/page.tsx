import type { Metadata } from "next";
import { FeatureGrid, InfoPage } from "@/components/InfoPage";
import { InstallApp } from "@/components/InstallApp";
import { alternates } from "@/i18n/seo";
import { getT } from "@/i18n/server";

const ITEMS = [
  { icon: "device-desktop", title: "Its own window", text: "Workify opens in a clean app window from your Start menu, Dock or desktop, without browser tabs." },
  { icon: "bolt", title: "One click away", text: "Launch Workify straight to your tools, without hunting for a bookmark." },
  { icon: "refresh", title: "Always up to date", text: "Updates arrive automatically. There is nothing to download or reinstall." },
];

export async function generateMetadata(): Promise<Metadata> {
  const { t, lang } = await getT();
  return { title: t("Workify Desktop"), alternates: alternates(lang, "/desktop") };
}

export default async function DesktopPage() {
  const { t } = await getT();
  return (
    <InfoPage icon="device-desktop" title={t("Workify Desktop")} subtitle={t("Install Workify on Windows, macOS or Linux and open it like any other app.")} wide>
      <div className="mx-auto mb-12 max-w-xl rounded-2xl border border-line bg-white p-8 text-center">
        <h2 className="mb-4 text-xl font-bold">{t("Install in one click")}</h2>
        <InstallApp />
      </div>
      <FeatureGrid items={ITEMS.map((i) => ({ ...i, title: t(i.title), text: t(i.text) }))} />
    </InfoPage>
  );
}
