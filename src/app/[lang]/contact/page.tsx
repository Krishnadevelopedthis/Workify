import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";
import { alternates } from "@/i18n/seo";
import { getT } from "@/i18n/server";
import { ContactForm } from "./ContactForm";

export async function generateMetadata(): Promise<Metadata> {
  const { t, lang } = await getT();
  return { title: t("Contact us"), alternates: alternates(lang, "/contact") };
}

export default async function ContactPage() {
  const { t } = await getT();
  return (
    <InfoPage icon="mail" title={t("Contact us")} subtitle={t("Questions, feedback or business enquiries — send us a message.")}>
      <ContactForm />
    </InfoPage>
  );
}
