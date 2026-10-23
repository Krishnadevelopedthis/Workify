import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";
import { Link } from "@/i18n/Link";
import { rich } from "@/i18n/rich";
import { alternates } from "@/i18n/seo";
import { getT } from "@/i18n/server";
import { SITE_URL } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const { t, lang } = await getT();
  return {
    title: t("Developer API"),
    description: t("Run Workify's PDF tools and send documents for signature from your own code, Zapier or Make."),
    alternates: alternates(lang, "/developers"),
  };
}

function Code({ children }: { children: string }) {
  return (
    <pre className="my-3 overflow-x-auto rounded-xl bg-[#1f1f26] p-4 text-[13px] leading-6 text-white" dir="ltr">
      <code>{children}</code>
    </pre>
  );
}

export default async function DevelopersPage() {
  const { t } = await getT();
  const base = SITE_URL;
  const ENDPOINTS: [string, string, string][] = [
    ["GET", "/api/v1/me", t("Check your API key")],
    ["GET", "/api/v1/tools", t("List the tools and their options")],
    ["POST", "/api/v1/tools/{tool}", t("Run a tool on uploaded files")],
    ["GET", "/api/v1/tasks/{id}", t("Status and result of a background task")],
    ["POST", "/api/v1/signatures", t("Send a PDF for signature")],
    ["GET", "/api/v1/signatures", t("List your signature requests")],
    ["GET", "/api/v1/signatures/{id}", t("Status of a request and each signer")],
    ["GET", "/api/v1/signatures/{id}/file", t("Download the completed, sealed PDF")],
  ];

  return (
    <InfoPage icon="code" title={t("Developer API")} subtitle={t("Run Workify's PDF tools and send documents for signature from your own code, Zapier or Make.")} wide>
      <div className="prose-page max-w-none">
        <h2>{t("1. Get an API key")}</h2>
        <p>
          {rich(t("Create a free account, confirm your email, then create a key on your <link>Developer</link> page. Send it with every request:"), {
            link: (c) => <Link href="/account/developer" className="text-brand underline">{c}</Link>,
          })}
        </p>
        <Code>{`Authorization: Bearer wfy_your_key`}</Code>

        <h2>{t("2. Run a tool")}</h2>
        <p>{t("Upload files as multipart/form-data. Options are a JSON object; any option you leave out uses the tool's default. The response contains a download link that works for one hour.")}</p>
        <Code>{`curl -X POST ${base}/api/v1/tools/compress-pdf \\
  -H "Authorization: Bearer wfy_your_key" \\
  -F "files=@report.pdf" \\
  -F 'options={"level":"extreme"}'`}</Code>
        <Code>{`{
  "status": "done",
  "tool": "compress-pdf",
  "result": {
    "file_name": "report_compressed.pdf",
    "size": 183204,
    "download_url": "${base}/api/download/…/report_compressed.pdf",
    "expires_at": "…"
  }
}`}</Code>
        <p>{t("Add ?response=file to receive the file itself instead of JSON:")}</p>
        <Code>{`curl -X POST "${base}/api/v1/tools/merge-pdf?response=file" \\
  -H "Authorization: Bearer wfy_your_key" \\
  -F "files=@a.pdf" -F "files=@b.pdf" -o merged.pdf`}</Code>

        <h2>{t("3. Long tasks and webhooks")}</h2>
        <p>{t("Big files can take a while. Send async=true to get a task id right away and poll its status, or send webhook_url to have the result posted to you.")}</p>
        <Code>{`curl -X POST ${base}/api/v1/tools/ocr-pdf \\
  -H "Authorization: Bearer wfy_your_key" \\
  -F "files=@scan.pdf" \\
  -F 'options={"language":"eng+hin"}' \\
  -F "webhook_url=https://example.com/workify-hook"`}</Code>
        <p>
          {t("Every webhook is a JSON POST with the headers X-Workify-Event, X-Workify-Timestamp and X-Workify-Signature (sha256=HMAC of “timestamp.body”, keyed with your signing secret). Events:")}
        </p>
        <ul>
          <li><code>task.completed</code>, <code>task.failed</code> — {t("a background task finished")}</li>
          <li><code>signature.signed</code> — {t("one signer signed")}</li>
          <li><code>signature.completed</code> — {t("everyone signed; the sealed PDF is ready")}</li>
          <li><code>signature.declined</code> — {t("a signer declined")}</li>
        </ul>
        <Code>{`// Node.js: verify a webhook
const expected = "sha256=" + crypto
  .createHmac("sha256", process.env.WORKIFY_WEBHOOK_SECRET)
  .update(req.headers["x-workify-timestamp"] + "." + rawBody)
  .digest("hex");
if (expected !== req.headers["x-workify-signature"]) throw new Error("bad signature");`}</Code>

        <h2>{t("4. Send for signature")}</h2>
        <Code>{`curl -X POST ${base}/api/v1/signatures \\
  -H "Authorization: Bearer wfy_your_key" \\
  -F "file=@contract.pdf" \\
  -F 'signers=[{"name":"Asha Rao","email":"asha@example.com"},{"name":"Ravi Kumar","email":"ravi@example.com"}]' \\
  -F "ordered=true" -F "reminder_days=2" -F "lang=hi" \\
  -F "message=Please sign by Friday."`}</Code>

        <h2>{t("All endpoints")}</h2>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-white" dir="ltr">
        <table className="w-full text-sm">
          <tbody>
            {ENDPOINTS.map(([method, path, what]) => (
              <tr key={method + path} className="border-b border-line last:border-0">
                <td className="p-3 font-mono font-bold text-brand">{method}</td>
                <td className="p-3 font-mono">{path}</td>
                <td className="p-3 text-muted">{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="prose-page mt-8 max-w-none">
        <h2>{t("Zapier")}</h2>
        <ol>
          <li>{t("Create a Zap. As the action, choose “Webhooks by Zapier” → “Custom Request” (POST).")}</li>
          <li>{t("URL: the endpoint, e.g. /api/v1/tools/compress-pdf. Add the header Authorization: Bearer wfy_your_key.")}</li>
          <li>{t("Send the file from an earlier step as “files”, and options as a JSON text field.")}</li>
          <li>{t("To start a Zap when a document is signed, use “Webhooks by Zapier” → “Catch Hook” as the trigger, and add its URL as a webhook on your Developer page.")}</li>
        </ol>
        <h2>{t("Make")}</h2>
        <ol>
          <li>{t("Add an “HTTP → Make a request” module with method POST and body type multipart/form-data.")}</li>
          <li>{t("Add the Authorization header and the files and options fields as above.")}</li>
          <li>{t("For triggers, use a “Webhooks → Custom webhook” module and add its address on your Developer page.")}</li>
        </ol>
        <h2>{t("Limits and errors")}</h2>
        <p>{t("Each key can make 120 requests per 10 minutes. Files can be up to 200 MB each and 500 MB per request. Errors return JSON like this:")}</p>
        <Code>{`{ "error": { "status": 400, "message": "Select at least one file." } }`}</Code>
      </div>
    </InfoPage>
  );
}
