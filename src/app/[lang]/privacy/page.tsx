import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";
import { alternates } from "@/i18n/seo";
import { getT } from "@/i18n/server";

const SECTIONS: [string, string][] = [
  ["Files you upload", "Files are used only to perform the task you request. They are stored temporarily on our server and deleted automatically one hour after processing, or immediately when you click delete on the download page. We do not read, share or sell your documents."],
  ["Signature requests", "When you request signatures, we store the PDF, the names and email addresses of the signers, and an audit trail (when each person viewed and signed, with their IP address and browser). They are kept until the request is completed and for up to 30 days after it was created."],
  ["Account data", "If you create an account we store your name, email address, a salted hash of your password, the workflows and signature templates you save, and hashes of your API keys. You can delete your account and all of this data at any time from your account page."],
  ["Emails", "We send emails only for your account (confirmation and password reset) and for signature requests you take part in. We do not send marketing emails."],
  ["Contact form", "Messages sent through the contact form are stored so we can reply to them."],
  ["Cookies", "We use one essential cookie to keep you logged in and one to remember your language. See our Cookies page for details."],
  ["Third-party services", "If Google Drive or Dropbox import and export are enabled and you use them, those services handle the sign-in and file transfer under their own privacy policies."],
];

export async function generateMetadata(): Promise<Metadata> {
  const { t, lang } = await getT();
  return { title: t("Privacy policy"), alternates: alternates(lang, "/privacy") };
}

export default async function PrivacyPage() {
  const { t } = await getT();
  return (
    <InfoPage icon="shield-check" title={t("Privacy policy")} subtitle={t("What we collect, why, and how long we keep it.")}>
      <div className="prose-page">
        {SECTIONS.map(([h, p]) => (
          <section key={h}>
            <h2>{t(h)}</h2>
            <p>{t(p)}</p>
          </section>
        ))}
      </div>
    </InfoPage>
  );
}
