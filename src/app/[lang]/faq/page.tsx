import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";
import { Link } from "@/i18n/Link";
import { rich } from "@/i18n/rich";
import { alternates } from "@/i18n/seo";
import { getT } from "@/i18n/server";

const FAQ: [string, string, string?][] = [
  ["Is Workify free?", "Yes. Every tool is free to use. A Premium plan is coming later, and everything you can do today stays free."],
  ["Do I need an account?", "No. An account lets you save workflows, track signature requests and create API keys. <link>Create one here</link>.", "/signup"],
  ["What happens to my files?", "Files are processed on our server and deleted automatically after one hour. You can delete them right away from the download page. Read more on our <link>Security</link> page.", "/security"],
  ["How large can my files be?", "Each file can be up to 200 MB, and up to 500 MB per task."],
  ["Can I process several files at once?", "Yes. Most tools accept multiple files and return them together in a ZIP."],
  ["Can I convert scanned PDFs to Word, PowerPoint or Excel?", "Yes. Tick “Scanned PDF: recognize the text (OCR)” in the tool's options and choose the document's languages."],
  ["How do I collect signatures from several people?", "Open <link>Sign PDF</link>, choose “Several people”, add each signer's name and email, and Workify emails them in the order you set.", "/sign-pdf"],
  ["Why is AI Summarizer unavailable?", "AI Summarizer and Translate PDF are temporarily unavailable. They will return in a future update."],
  ["My PDF is password protected. What can I do?", "Use <link>Unlock PDF</link> with the password, then use any other tool on the unlocked file.", "/unlock-pdf"],
  ["Is redaction permanent?", "Yes. Redact PDF removes the underlying text and image pixels; the content cannot be recovered from the redacted file."],
  ["How does Scan to PDF work with my phone?", "Open Scan to PDF on your computer, click “Show QR code”, and scan it with your phone. Photos you take on the phone appear on the computer automatically."],
  ["Can I use Workify from my own software?", "Yes. Create an API key in your account and follow the <link>developer guide</link>.", "/developers"],
  ["Which browsers are supported?", "Recent versions of Chrome, Edge, Firefox and Safari on desktop and mobile."],
];

export async function generateMetadata(): Promise<Metadata> {
  const { t, lang } = await getT();
  return { title: t("FAQ"), alternates: alternates(lang, "/faq") };
}

export default async function FaqPage() {
  const { t } = await getT();
  return (
    <InfoPage icon="help-circle" title={t("Frequently asked questions")}>
      <div className="space-y-3">
        {FAQ.map(([q, a, href]) => (
          <details key={q} className="wf-details group rounded-xl border border-line bg-white p-5 open:shadow-sm">
            <summary className="cursor-pointer list-none rounded-md text-start font-semibold marker:hidden focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand [&::-webkit-details-marker]:hidden">
              <span className="flex items-center justify-between gap-4">
                {t(q)}
                <span className="text-xl text-brand transition group-open:rotate-45 motion-reduce:transition-none">+</span>
              </span>
            </summary>
            <p className="mt-3 leading-7 text-muted">
              {rich(t(a), { link: (c) => <Link href={href ?? "/"} className="text-brand underline">{c}</Link> })}
            </p>
          </details>
        ))}
      </div>
      <p className="mt-8 text-center text-muted">
        {t("Still have a question?")} <Link href="/contact" className="font-semibold text-brand">{t("Contact us")}</Link>
      </p>
    </InfoPage>
  );
}
