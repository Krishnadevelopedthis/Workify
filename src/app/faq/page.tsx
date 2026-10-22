import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/InfoPage";

export const metadata: Metadata = { title: "FAQ" };

const FAQ: [string, React.ReactNode][] = [
  ["Is Workify free?", "Yes. Every tool is free to use, and Premium features are unlocked for everyone right now."],
  ["Do I need an account?", <>No. An account only lets you save workflows and track signature requests. <Link href="/signup" className="text-brand underline">Create one here</Link>.</>],
  ["What happens to my files?", <>Files are processed on our server and deleted automatically after one hour. You can delete them right away from the download page. Read more on our <Link href="/security" className="text-brand underline">Security</Link> page.</>],
  ["How large can my files be?", "Each file can be up to 200 MB, and up to 500 MB per task."],
  ["Can I process several files at once?", "Yes. Most tools accept multiple files and return them together in a ZIP."],
  ["Why is AI Summarizer unavailable?", "AI Summarizer and Translate PDF are temporarily unavailable. They will return in a future update."],
  ["My PDF is password protected. What can I do?", <>Use <Link href="/unlock-pdf" className="text-brand underline">Unlock PDF</Link> with the password, then use any other tool on the unlocked file.</>],
  ["Is redaction permanent?", "Yes. Redact PDF removes the underlying text and image pixels; the content cannot be recovered from the redacted file."],
  ["How does Scan to PDF work with my phone?", "Open Scan to PDF on your computer, click “Show QR code”, and scan it with your phone. Photos you take on the phone appear on the computer automatically."],
  ["Which browsers are supported?", "Recent versions of Chrome, Edge, Firefox and Safari on desktop and mobile."],
];

export default function FaqPage() {
  return (
    <InfoPage icon="help-circle" title="Frequently asked questions">
      <div className="space-y-3">
        {FAQ.map(([q, a]) => (
          <details key={q} className="group rounded-xl border border-line bg-white p-5 open:shadow-sm">
            <summary className="cursor-pointer list-none font-semibold marker:hidden">
              <span className="flex items-center justify-between gap-4">
                {q}
                <span className="text-xl text-brand transition group-open:rotate-45">+</span>
              </span>
            </summary>
            <p className="mt-3 leading-7 text-muted">{a}</p>
          </details>
        ))}
      </div>
      <p className="mt-8 text-center text-muted">
        Still have a question? <Link href="/contact" className="font-semibold text-brand">Contact us</Link>
      </p>
    </InfoPage>
  );
}
