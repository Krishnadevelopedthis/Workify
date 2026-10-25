import type { Metadata } from "next";
import { Cta, FeatureGrid, InfoPage } from "@/components/InfoPage";
import { alternates } from "@/i18n/seo";
import { getT } from "@/i18n/server";

const FEATURES = [
  { icon: "arrows-join-2", title: "Organize", text: "Merge, split, reorder, rotate, remove, extract and insert pages. Turn phone photos into PDFs with Scan to PDF." },
  { icon: "arrows-minimize", title: "Optimize", text: "Compress large files, repair damaged PDFs and make scanned documents searchable with OCR in 34 languages." },
  { icon: "file-export", title: "Convert", text: "Convert to and from Word, PowerPoint, Excel, JPG, HTML, PDF/A and Markdown, including scanned PDFs." },
  { icon: "edit", title: "Edit", text: "Add text, images, shapes and drawings, page numbers and watermarks. Crop pages and build fillable forms." },
  { icon: "lock", title: "Secure", text: "Password-protect or unlock PDFs, permanently redact sensitive content and compare two versions side by side." },
  { icon: "signature", title: "Sign", text: "Sign yourself, or send a document to several signers in order, with email invites, reminders, an audit trail and a digital certificate." },
  { icon: "route", title: "Workflows", text: "Chain several tools into one reusable workflow and run it on many files at once." },
  { icon: "world", title: "11 languages", text: "Use Workify in English, Hindi, Spanish, French, German, Portuguese, Arabic, Indonesian, Japanese, Russian or Chinese." },
  { icon: "cloud-upload", title: "Cloud import and export", text: "Open files from Google Drive or Dropbox and save the results back with one click." },
  { icon: "upload", title: "Drag & drop", text: "Drop files anywhere on the page, reorder them by dragging and pick up where you left off with “Continue to…”." },
  { icon: "shield-check", title: "Private", text: "Files are processed on our server and deleted automatically after one hour, or immediately when you ask." },
];

export async function generateMetadata(): Promise<Metadata> {
  const { t, lang } = await getT();
  return { title: t("Features"), alternates: alternates(lang, "/features") };
}

export default async function FeaturesPage() {
  const { t } = await getT();
  return (
    <InfoPage icon="sparkles" title={t("Features")} subtitle={t("Everything you need to organize, convert, edit and secure PDFs, in your browser.")} wide>
      <FeatureGrid items={FEATURES.map((f) => ({ ...f, title: t(f.title), text: t(f.text) }))} />
      <Cta title={t("Ready to work with your PDFs?")} text={t("No sign-up required. Pick a tool and drop in your files.")} href="/" label={t("Explore all tools")} />
    </InfoPage>
  );
}
