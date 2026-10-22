import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <InfoPage icon="shield-check" title="Privacy policy" subtitle="What we collect, why, and how long we keep it.">
      <div className="prose-page">
        <h2>Files you upload</h2>
        <p>Files are used only to perform the task you request. They are stored temporarily on our server and deleted automatically one hour after processing, or immediately when you click delete on the download page. We do not read, share or sell your documents.</p>
        <h2>Signature requests</h2>
        <p>When you create a signature request, the PDF is kept until it is signed and for up to 30 days, so the signer can open it and you can download the signed copy.</p>
        <h2>Account data</h2>
        <p>If you create an account we store your name, email address, a salted hash of your password, and the workflows you choose to save. You can stop using your account at any time; contact us to have it deleted.</p>
        <h2>Contact form</h2>
        <p>Messages sent through the contact form are stored so we can reply to them.</p>
        <h2>Cookies</h2>
        <p>We use one essential cookie to keep you logged in. See our Cookies page for details.</p>
        <h2>Third-party services</h2>
        <p>If Google Drive or Dropbox import is enabled and you use it, those services handle the sign-in and file selection under their own privacy policies.</p>
      </div>
    </InfoPage>
  );
}
