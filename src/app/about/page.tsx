import type { Metadata } from "next";
import { Cta, InfoPage } from "@/components/InfoPage";

export const metadata: Metadata = { title: "About us" };

export default function AboutPage() {
  return (
    <InfoPage icon="heart" title="About Workify" subtitle="Simple, free PDF tools for everyone.">
      <div className="prose-page">
        <p>Workify started with a simple idea: working with PDFs should not need expensive software or a complicated setup. Merging a report, signing a form or shrinking a file for an email should take seconds.</p>
        <h2>What we believe</h2>
        <ul>
          <li><strong>Free first.</strong> Every tool is free to use.</li>
          <li><strong>Private by default.</strong> Files are deleted after one hour and never shared.</li>
          <li><strong>Built on open standards.</strong> Workify uses proven open-source engines such as Ghostscript, qpdf, LibreOffice, Tesseract and pdf.js.</li>
        </ul>
        <h2>The project</h2>
        <p>Workify is built with Next.js and runs on your own server, so organisations can keep documents in-house.</p>
      </div>
      <Cta title="Questions or ideas?" text="We'd love to hear how you use Workify." href="/contact" label="Contact us" />
    </InfoPage>
  );
}
