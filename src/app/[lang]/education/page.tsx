import type { Metadata } from "next";
import { Cta, FeatureGrid, InfoPage } from "@/components/InfoPage";
import { alternates } from "@/i18n/seo";
import { getT } from "@/i18n/server";

const ITEMS = [
  { icon: "arrows-join-2", title: "Submit assignments", text: "Merge scanned pages and typed work into one PDF, then compress it under upload limits." },
  { icon: "forms", title: "Create worksheets", text: "Turn any PDF into a fillable form with text fields and checkboxes." },
  { icon: "edit", title: "Annotate", text: "Highlight, draw and add comments to readings and slides." },
  { icon: "text-recognition", title: "Search scans", text: "OCR makes scanned textbooks and notes searchable." },
  { icon: "git-compare", title: "Compare drafts", text: "See exactly what changed between two versions of an essay." },
  { icon: "heart", title: "Always free", text: "No student plan needed — every tool is free." },
];

export async function generateMetadata(): Promise<Metadata> {
  const { t, lang } = await getT();
  return { title: t("Workify for Education"), alternates: alternates(lang, "/education") };
}

export default async function EducationPage() {
  const { t } = await getT();
  return (
    <InfoPage icon="school" title={t("Workify for Education")} subtitle={t("Free PDF tools for students, teachers and schools.")} wide>
      <FeatureGrid items={ITEMS.map((i) => ({ ...i, title: t(i.title), text: t(i.text) }))} />
      <Cta title={t("Start with Merge PDF")} text={t("The tool students use most for submissions.")} href="/merge-pdf" label={t("Merge PDF")} />
    </InfoPage>
  );
}
