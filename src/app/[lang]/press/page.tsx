import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";
import { Logo } from "@/components/Logo";
import { Link } from "@/i18n/Link";
import { alternates } from "@/i18n/seo";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t, lang } = await getT();
  return { title: t("Press"), alternates: alternates(lang, "/press") };
}

export default async function PressPage() {
  const { t } = await getT();
  return (
    <InfoPage icon="speakerphone" title={t("Press")} subtitle={t("Resources for journalists and partners.")}>
      <div className="prose-page">
        <h2>{t("About Workify")}</h2>
        <p>{t("Workify is a free, web-based suite of PDF tools: merge, split, compress, convert, edit, sign, redact and more, with reusable workflows and installable desktop and mobile apps, in 11 languages.")}</p>
        <h2>{t("Brand")}</h2>
        <p>{t("Please write the name as “Workify”. The trailing “fy” is shown in our accent orange.")}</p>
      </div>
      <div className="my-6 flex items-center justify-center gap-8 rounded-2xl border border-line bg-white p-8">
        <Logo />
        <a href="/icon.svg" download="workify-icon.svg" className="btn-secondary">{t("Download icon (SVG)")}</a>
      </div>
      <p className="text-center text-muted">
        {t("Press enquiries:")} <Link href="/contact" className="font-semibold text-brand">{t("contact us")}</Link> {t("and choose “Press”.")}
      </p>
    </InfoPage>
  );
}
