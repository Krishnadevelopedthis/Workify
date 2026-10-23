import type { Metadata } from "next";
import { FeatureGrid, InfoPage } from "@/components/InfoPage";
import { InstallApp } from "@/components/InstallApp";
import { Link } from "@/i18n/Link";
import { alternates } from "@/i18n/seo";
import { getT } from "@/i18n/server";

const ITEMS = [
  { icon: "scan", title: "Scan documents", text: "Use your camera with Scan to PDF, or send scans straight to your computer with a QR code." },
  { icon: "signature", title: "Sign on the go", text: "Draw your signature with your finger and send the signed PDF in seconds." },
  { icon: "layout-grid", title: "Every tool", text: "The same tools as on desktop, designed to work on small screens." },
];

export async function generateMetadata(): Promise<Metadata> {
  const { t, lang } = await getT();
  return { title: t("Workify Mobile"), alternates: alternates(lang, "/mobile") };
}

export default async function MobilePage() {
  const { t } = await getT();
  return (
    <InfoPage icon="device-mobile" title={t("Workify Mobile")} subtitle={t("All your PDF tools on Android and iPhone — add Workify to your home screen.")} wide>
      <div className="mx-auto mb-12 max-w-xl rounded-2xl border border-line bg-white p-8 text-center">
        <h2 className="mb-4 text-xl font-bold">{t("Add to your home screen")}</h2>
        <InstallApp />
      </div>
      <FeatureGrid items={ITEMS.map((i) => ({ ...i, title: t(i.title), text: t(i.text) }))} />
      <p className="mt-10 text-center">
        <Link href="/scan-to-pdf" className="btn-primary">{t("Try Scan to PDF")}</Link>
      </p>
    </InfoPage>
  );
}
