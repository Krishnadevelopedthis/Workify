import type { Metadata } from "next";
import { Cta, FeatureGrid, InfoPage } from "@/components/InfoPage";

export const metadata: Metadata = { title: "Features" };

export default function FeaturesPage() {
  return (
    <InfoPage icon="sparkles" title="Features" subtitle="Everything you need to organize, convert, edit and secure PDFs, in your browser." wide>
      <FeatureGrid
        items={[
          { icon: "arrows-join-2", title: "Organize", text: "Merge, split, reorder, rotate, delete and insert pages. Turn phone photos into PDFs with Scan to PDF." },
          { icon: "arrows-minimize", title: "Optimize", text: "Compress large files, repair damaged PDFs and make scanned documents searchable with OCR." },
          { icon: "file-export", title: "Convert", text: "Convert to and from Word, PowerPoint, Excel, JPG, HTML, PDF/A and Markdown." },
          { icon: "edit", title: "Edit", text: "Add text, images, shapes and drawings, page numbers and watermarks. Crop pages and build fillable forms." },
          { icon: "lock", title: "Secure", text: "Password-protect or unlock PDFs, permanently redact sensitive content and compare two versions side by side." },
          { icon: "signature", title: "Sign", text: "Sign yourself in seconds or send a signing link to someone else and download the signed copy." },
          { icon: "route", title: "Workflows", text: "Chain several tools into one reusable workflow and run it on many files at once." },
          { icon: "upload", title: "Drag & drop", text: "Drop files anywhere on the page, reorder them by dragging and pick up where you left off with “Continue to…”." },
          { icon: "shield-check", title: "Private", text: "Files are processed on our server and deleted automatically after one hour, or immediately when you ask." },
        ]}
      />
      <Cta title="Ready to work with your PDFs?" text="No sign-up required. Pick a tool and drop in your files." href="/" label="Explore all tools" />
    </InfoPage>
  );
}
