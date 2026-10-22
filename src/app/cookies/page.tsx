import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";

export const metadata: Metadata = { title: "Cookies" };

export default function CookiesPage() {
  return (
    <InfoPage icon="info-circle" title="Cookies">
      <div className="prose-page">
        <p>Workify uses as few cookies as possible. There are no advertising or tracking cookies.</p>
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-bg">
              <tr><th className="p-3">Name</th><th className="p-3">Purpose</th><th className="p-3">Duration</th></tr>
            </thead>
            <tbody>
              <tr className="border-t border-line"><td className="p-3 font-mono">wf_session</td><td className="p-3">Keeps you logged in (only set when you log in).</td><td className="p-3">30 days</td></tr>
            </tbody>
          </table>
        </div>
        <h2>Browser storage</h2>
        <p>If you save a workflow without an account, it is kept in your browser&apos;s local storage on this device only.</p>
      </div>
    </InfoPage>
  );
}
