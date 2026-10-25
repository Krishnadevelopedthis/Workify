import type { Metadata } from "next";
import { FeatureGrid, InfoPage } from "@/components/InfoPage";
import { alternates } from "@/i18n/seo";
import { getT } from "@/i18n/server";

const ITEMS = [
  { icon: "clock", title: "Automatic deletion", text: "Uploaded and processed files are deleted from the server one hour after processing. The download page also lets you delete them immediately." },
  { icon: "lock", title: "Strong PDF encryption", text: "Protect PDF uses 256-bit AES encryption. Passwords are used only for that task and are never stored." },
  { icon: "user", title: "Safe accounts", text: "Passwords are hashed with scrypt and a unique salt. Sessions use secure, http-only cookies and are revoked when you change or reset your password." },
  { icon: "mail-check", title: "Verified email addresses", text: "Accounts confirm their email address, and password reset links are single-use and expire after one hour." },
  { icon: "eye-off", title: "True redaction", text: "Redact PDF removes the text, image pixels and graphics underneath each redaction, not just a black box on top." },
  { icon: "world-www", title: "Isolated web capture", text: "HTML to PDF refuses addresses on private networks, so the tool cannot be used to reach internal systems." },
  { icon: "signature", title: "Unguessable signing links", text: "Every signer gets a personal link with a random 128-bit token. Links expire after 30 days." },
  { icon: "certificate", title: "Tamper-evident signatures", text: "Completed documents carry a digital signature and an audit trail, so any later change to the file is detectable." },
];

export async function generateMetadata(): Promise<Metadata> {
  const { t, lang } = await getT();
  return { title: t("Security"), alternates: alternates(lang, "/security") };
}

export default async function SecurityPage() {
  const { t } = await getT();
  return (
    <InfoPage icon="shield-check" title={t("Security")} subtitle={t("How Workify keeps your documents safe.")} wide>
      <FeatureGrid items={ITEMS.map((i) => ({ ...i, title: t(i.title), text: t(i.text) }))} />
    </InfoPage>
  );
}
