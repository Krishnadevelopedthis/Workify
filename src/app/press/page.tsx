import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/InfoPage";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = { title: "Press" };

export default function PressPage() {
  return (
    <InfoPage icon="speakerphone" title="Press" subtitle="Resources for journalists and partners.">
      <div className="prose-page">
        <h2>About Workify</h2>
        <p>Workify is a free, web-based suite of PDF tools: merge, split, compress, convert, edit, sign, redact and more, with reusable workflows and installable desktop and mobile apps.</p>
        <h2>Brand</h2>
        <p>Please write the name as “Workify”. The trailing “fy” is shown in our accent orange.</p>
      </div>
      <div className="my-6 flex items-center justify-center gap-8 rounded-2xl border border-line bg-white p-8">
        <Logo />
        <a href="/icon.svg" download="workify-icon.svg" className="btn-secondary">Download icon (SVG)</a>
      </div>
      <p className="text-center text-muted">
        Press enquiries: <Link href="/contact" className="font-semibold text-brand">contact us</Link> and choose “Press”.
      </p>
    </InfoPage>
  );
}
