import type { Metadata } from "next";
import { Cta, FeatureGrid, InfoPage } from "@/components/InfoPage";

export const metadata: Metadata = { title: "Workify for Business" };

export default function BusinessPage() {
  return (
    <InfoPage icon="building" title="Workify for Business" subtitle="Document tools your whole team can use, on infrastructure you control." wide>
      <FeatureGrid
        items={[
          { icon: "route", title: "Automate with workflows", text: "Save multi-step workflows such as compress → number pages → protect, and run them on batches of files." },
          { icon: "signature", title: "Collect signatures", text: "Send signing links to clients and colleagues and download the signed documents from your account." },
          { icon: "shield-check", title: "Self-hosted", text: "Run Workify on your own server so documents never leave your network." },
          { icon: "users", title: "Easy onboarding", text: "No installs and no training: if your team can use a browser, they can use Workify." },
          { icon: "eye-off", title: "Compliance-ready redaction", text: "Permanently remove personal data before sharing documents." },
          { icon: "archive", title: "Long-term archiving", text: "Convert records to PDF/A for long-term storage." },
        ]}
      />
      <Cta title="Talk to us about your team" text="Tell us what you need and we'll help you set up Workify for your organisation." href="/contact" label="Contact us" />
    </InfoPage>
  );
}
