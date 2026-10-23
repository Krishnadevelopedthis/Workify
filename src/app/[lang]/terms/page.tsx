import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";
import { alternates } from "@/i18n/seo";
import { getT } from "@/i18n/server";

const SECTIONS: [string, string][] = [
  ["Using Workify", "Workify provides online tools to process PDF and office documents. You may use it for personal, educational and commercial work."],
  ["Your content", "You keep all rights to the files you upload. You confirm you have the right to process them, and you must not use Workify to process unlawful content or to remove protection from documents you are not authorised to unlock."],
  ["Electronic signatures", "Signatures created with Workify are electronic signatures with an audit trail. You are responsible for checking that this type of signature is accepted for your document and jurisdiction."],
  ["Developer API", "API keys are personal. Keep them secret and do not use the API to overload the service; we may limit or revoke keys that are abused."],
  ["Availability", "We aim to keep the service available but do not guarantee uninterrupted access. Features may change, and some tools may be temporarily unavailable."],
  ["No warranty", "The service is provided “as is”. Always keep a copy of your original files; we are not liable for data loss or for the results of conversions."],
  ["Accounts", "You are responsible for keeping your password secure. We may suspend accounts that abuse the service. You can delete your account at any time."],
];

export async function generateMetadata(): Promise<Metadata> {
  const { t, lang } = await getT();
  return { title: t("Terms & conditions"), alternates: alternates(lang, "/terms") };
}

export default async function TermsPage() {
  const { t } = await getT();
  return (
    <InfoPage icon="file" title={t("Terms & conditions")}>
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
