import type { Metadata } from "next";
import { Cta, InfoPage } from "@/components/InfoPage";
import { alternates } from "@/i18n/seo";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t, lang } = await getT();
  return { title: t("About us"), alternates: alternates(lang, "/about") };
}

export default async function AboutPage() {
  const { t } = await getT();
  return (
    <InfoPage icon="heart" title={t("About Workify")} subtitle={t("Simple, free PDF tools for everyone.")}>
      <div className="prose-page">
        <p>{t("Workify started with a simple idea: working with PDFs should not need expensive software or a complicated setup. Merging a report, signing a form or shrinking a file for an email should take seconds.")}</p>
        <h2>{t("What we believe")}</h2>
        <ul>
          <li><strong>{t("Free first.")}</strong> {t("Every tool is free to use.")}</li>
          <li><strong>{t("Private by default.")}</strong> {t("Files are deleted after one hour and never shared.")}</li>
          <li><strong>{t("Built on open standards.")}</strong> {t("Workify uses proven open-source engines such as Ghostscript, qpdf, LibreOffice, Tesseract and pdf.js.")}</li>
        </ul>
        <h2>{t("The project")}</h2>
        <p>{t("Workify is built with Next.js and runs on your own server, so organisations can keep documents in-house.")}</p>
      </div>
      <Cta title={t("Questions or ideas?")} text={t("We'd love to hear how you use Workify.")} href="/contact" label={t("Contact us")} />
    </InfoPage>
  );
}
