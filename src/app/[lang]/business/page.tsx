import type { Metadata } from "next";
import { Cta, FeatureGrid, InfoPage } from "@/components/InfoPage";
import { alternates } from "@/i18n/seo";
import { getT } from "@/i18n/server";

const ITEMS = [
  { icon: "route", title: "Automate with workflows", text: "Save multi-step workflows such as compress → number pages → protect, and run them on batches of files." },
  { icon: "signature", title: "Collect signatures", text: "Send documents to several signers in order, with email invites, reminders, an audit trail and a digital certificate." },
  { icon: "shield-check", title: "Self-hosted", text: "Run Workify on your own server so documents never leave your network." },
  { icon: "eye-off", title: "Compliance-ready redaction", text: "Permanently remove personal data before sharing documents." },
  { icon: "archive", title: "Long-term archiving", text: "Convert records to PDF/A for long-term storage." },
];

export async function generateMetadata(): Promise<Metadata> {
  const { t, lang } = await getT();
  return { title: t("Workify for Business"), alternates: alternates(lang, "/business") };
}

export default async function BusinessPage() {
  const { t } = await getT();
  return (
    <InfoPage icon="building" title={t("Workify for Business")} subtitle={t("Document tools your whole team can use, on infrastructure you control.")} wide>
      <FeatureGrid items={ITEMS.map((i) => ({ ...i, title: t(i.title), text: t(i.text) }))} />
      <Cta title={t("Talk to us about your team")} text={t("Tell us what you need and we'll help you set up Workify for your organisation.")} href="/contact" label={t("Contact us")} />
    </InfoPage>
  );
}
