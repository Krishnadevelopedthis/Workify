import type { Metadata } from "next";
import { FeatureGrid, InfoPage } from "@/components/InfoPage";

export const metadata: Metadata = { title: "Security" };

export default function SecurityPage() {
  return (
    <InfoPage icon="shield-check" title="Security" subtitle="How Workify keeps your documents safe." wide>
      <FeatureGrid
        items={[
          { icon: "clock", title: "Automatic deletion", text: "Uploaded and processed files are deleted from the server one hour after processing. The download page also lets you delete them immediately." },
          { icon: "lock", title: "Strong PDF encryption", text: "Protect PDF uses 256-bit AES encryption. Passwords are used only for that task and are never stored." },
          { icon: "user", title: "Safe accounts", text: "Passwords are hashed with scrypt and a unique salt. Sessions use secure, http-only cookies and are revoked when you change your password." },
          { icon: "eye-off", title: "True redaction", text: "Redact PDF removes the text, image pixels and graphics underneath each redaction, not just a black box on top." },
          { icon: "world-www", title: "Isolated web capture", text: "HTML to PDF refuses addresses on private networks, so the tool cannot be used to reach internal systems." },
          { icon: "signature", title: "Unguessable signing links", text: "Signature request links contain a random 128-bit token and expire after 30 days." },
        ]}
      />
    </InfoPage>
  );
}
