import type { Metadata } from "next";
import { Cta, FeatureGrid, InfoPage } from "@/components/InfoPage";

export const metadata: Metadata = { title: "Workify for Education" };

export default function EducationPage() {
  return (
    <InfoPage icon="school" title="Workify for Education" subtitle="Free PDF tools for students, teachers and schools." wide>
      <FeatureGrid
        items={[
          { icon: "arrows-join-2", title: "Submit assignments", text: "Merge scanned pages and typed work into one PDF, then compress it under upload limits." },
          { icon: "forms", title: "Create worksheets", text: "Turn any PDF into a fillable form with text fields and checkboxes." },
          { icon: "edit", title: "Annotate", text: "Highlight, draw and add comments to readings and slides." },
          { icon: "text-recognition", title: "Search scans", text: "OCR makes scanned textbooks and notes searchable." },
          { icon: "git-compare", title: "Compare drafts", text: "See exactly what changed between two versions of an essay." },
          { icon: "heart", title: "Always free", text: "No student plan needed — every tool is free." },
        ]}
      />
      <Cta title="Start with Merge PDF" text="The tool students use most for submissions." href="/merge-pdf" label="Merge PDF" />
    </InfoPage>
  );
}
