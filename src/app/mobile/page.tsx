import type { Metadata } from "next";
import Link from "next/link";
import { FeatureGrid, InfoPage } from "@/components/InfoPage";
import { InstallApp } from "@/components/InstallApp";

export const metadata: Metadata = { title: "Workify Mobile" };

export default function MobilePage() {
  return (
    <InfoPage icon="device-mobile" title="Workify Mobile" subtitle="All your PDF tools on Android and iPhone — add Workify to your home screen." wide>
      <div className="mx-auto mb-12 max-w-xl rounded-2xl border border-line bg-white p-8 text-center">
        <h2 className="mb-4 text-xl font-bold">Add to your home screen</h2>
        <InstallApp />
      </div>
      <FeatureGrid
        items={[
          { icon: "scan", title: "Scan documents", text: "Use your camera with Scan to PDF, or send scans straight to your computer with a QR code." },
          { icon: "signature", title: "Sign on the go", text: "Draw your signature with your finger and send the signed PDF in seconds." },
          { icon: "layout-grid", title: "Every tool", text: "The same tools as on desktop, designed to work on small screens." },
        ]}
      />
      <p className="mt-10 text-center">
        <Link href="/scan-to-pdf" className="btn-primary">Try Scan to PDF</Link>
      </p>
    </InfoPage>
  );
}
