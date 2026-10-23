import type { Metadata } from "next";
import { listTemplates } from "@/app/actions/signatures";
import { HoverLink } from "@/components/HoverLink";
import { Icon } from "@/components/Icon";
import { requestStatus, StatusBadge } from "@/components/sign/RequestDetail";
import { LOCALE_TAGS } from "@/i18n/config";
import { getT } from "@/i18n/server";
import { requireUser } from "@/server/require-user";
import { requestsForUser } from "@/server/sign-requests";
import { TemplateList } from "./TemplateList";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("Signatures"), robots: { index: false } };
}

export default async function SignaturesPage() {
  const { t, lang } = await getT();
  const user = await requireUser("/account/signatures");
  const requests = requestsForUser(user.id);
  const templates = await listTemplates();

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-2xl border border-line bg-white p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">{t("Signature requests")}</h2>
          <HoverLink href="/sign-pdf" className="text-sm font-semibold text-brand">+ {t("New request")}</HoverLink>
        </div>
        {requests.length === 0 ? (
          <p className="text-sm text-muted">{t("Requests you send from Sign PDF → “Several people” show up here.")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {requests.map((r) => (
              <li key={r.id}>
                <HoverLink href={`/account/signatures/${r.id}`} className="flex flex-wrap items-center gap-3 py-3 hover:bg-bg/50">
                  <Icon name="file-type-pdf" size={26} className="shrink-0 text-brand" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{r.file_name}</p>
                    <p className="text-sm text-muted">
                      {t("{signed} of {total} signed", { signed: r.signed_count ?? 0, total: r.signer_count })} ·{" "}
                      {new Date(r.created_at).toLocaleDateString(LOCALE_TAGS[lang])}
                    </p>
                  </div>
                  <StatusBadge status={requestStatus(r)} t={t} />
                  <Icon name="chevron-right" size={18} className="text-muted rtl:rotate-180" />
                </HoverLink>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-line bg-white p-6">
        <h2 className="mb-1 flex items-center gap-2 font-bold"><Icon name="template" size={20} /> {t("Templates")}</h2>
        <p className="mb-3 text-sm text-muted">{t("Save the signers, message and settings you use often, and load them in one click when you send a new request.")}</p>
        <TemplateList templates={templates.map((x) => ({ id: x.id, name: x.name, signers: x.data.signers.map((s) => s.name) }))} />
      </div>
    </div>
  );
}
