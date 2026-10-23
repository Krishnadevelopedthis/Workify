import type { Metadata } from "next";
import { Icon } from "@/components/Icon";
import { Link } from "@/i18n/Link";
import { getT } from "@/i18n/server";
import { apiKeysOf } from "@/server/api";
import { userWebhookSecret, WEBHOOK_EVENTS, webhooksOf } from "@/server/webhooks";
import { requireUser } from "@/server/require-user";
import { ApiKeys, Webhooks } from "./DeveloperForms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("Developer"), robots: { index: false } };
}

export default async function DeveloperPage() {
  const { t } = await getT();
  const user = await requireUser("/account/developer");
  const keys = apiKeysOf(user.id);
  // Secrets are shown once, when a webhook is created; never sent to the page again.
  const hooks = webhooksOf(user.id).map((h) => ({ id: h.id, url: h.url, events: h.events, last_status: h.last_status, last_at: h.last_at }));

  return (
    <div className="mt-6 space-y-6">
      <p className="flex flex-wrap items-center gap-2 rounded-xl bg-bg px-4 py-3 text-sm">
        <Icon name="code" size={18} className="text-brand" />
        {t("Use these keys to run Workify tools and send documents for signature from your own code, Zapier or Make.")}
        <Link href="/developers" className="font-semibold text-brand underline">{t("Read the developer guide")}</Link>
      </p>
      {!user.verified && (
        <p className="rounded-xl border border-[#f1b800]/40 bg-[#f1b800]/10 px-4 py-3 text-sm">
          {t("Confirm your email address before creating API keys or webhooks.")}
        </p>
      )}
      <div className="rounded-2xl border border-line bg-white p-6">
        <h2 className="mb-1 flex items-center gap-2 font-bold"><Icon name="key" size={20} /> {t("API keys")}</h2>
        <p className="mb-4 text-sm text-muted">{t("Keys are shown once, when you create them. Workify stores only a hash.")}</p>
        <ApiKeys keys={keys} />
      </div>
      <div className="rounded-2xl border border-line bg-white p-6">
        <h2 className="mb-1 flex items-center gap-2 font-bold"><Icon name="webhook" size={20} /> {t("Webhooks")}</h2>
        <p className="mb-4 text-sm text-muted">
          {t("Workify sends a signed POST request to these addresses when an event happens.")}
        </p>
        <Webhooks hooks={hooks} events={[...WEBHOOK_EVENTS]} />
        <div className="mt-5 rounded-lg bg-bg p-4 text-sm">
          <p className="font-semibold">{t("Signing secret for webhook_url in API calls")}</p>
          <code className="mt-1 block break-all font-mono text-xs">{userWebhookSecret(user.id)}</code>
          <p className="mt-2 text-xs text-muted">
            {t("Check the X-Workify-Signature header: HMAC-SHA256 of “timestamp.body” with this secret.")}
          </p>
        </div>
      </div>
    </div>
  );
}
