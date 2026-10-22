import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";

export const metadata: Metadata = { title: "Terms & conditions" };

export default function TermsPage() {
  return (
    <InfoPage icon="file" title="Terms & conditions">
      <div className="prose-page">
        <h2>Using Workify</h2>
        <p>Workify provides online tools to process PDF and office documents. You may use it for personal, educational and commercial work.</p>
        <h2>Your content</h2>
        <p>You keep all rights to the files you upload. You confirm you have the right to process them, and you must not use Workify to process unlawful content or to remove protection from documents you are not authorised to unlock.</p>
        <h2>Availability</h2>
        <p>We aim to keep the service available but do not guarantee uninterrupted access. Features may change, and some tools may be temporarily unavailable.</p>
        <h2>No warranty</h2>
        <p>The service is provided “as is”. Always keep a copy of your original files; we are not liable for data loss or for the results of conversions.</p>
        <h2>Accounts</h2>
        <p>You are responsible for keeping your password secure. We may suspend accounts that abuse the service.</p>
      </div>
    </InfoPage>
  );
}
