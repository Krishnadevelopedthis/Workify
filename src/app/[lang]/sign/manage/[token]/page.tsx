import type { Metadata } from "next";
import { Icon } from "@/components/Icon";
import { RequestDetail } from "@/components/sign/RequestDetail";
import { Link } from "@/i18n/Link";
import { getT } from "@/i18n/server";
import { requestByManageToken } from "@/server/sign-requests";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("Signature request"), robots: { index: false } };
}

/** The owner's private management page (for requests sent without an account). */
export default async function ManageRequestPage({ params }: PageProps<"/[lang]/sign/manage/[token]">) {
  const { token } = await params;
  const { t, lang } = await getT();
  const request = requestByManageToken(token);
  if (!request) {
    return (
      <section className="flex flex-1 flex-col items-center px-4 py-24 text-center">
        <Icon name="alert-triangle" size={48} className="text-brand" />
        <h1 className="mt-4 text-3xl font-bold">{t("This link is invalid or has expired.")}</h1>
        <p className="mt-2 text-muted">{t("Requests and their files are deleted 30 days after they were sent.")}</p>
        <Link href="/sign-pdf" className="btn-primary mt-8">{t("Sign PDF")}</Link>
      </section>
    );
  }
  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-12">
      <h1 className="mb-2 text-3xl font-bold">{t("Signature request")}</h1>
      <p className="mb-6 flex items-center gap-2 text-sm text-muted">
        <Icon name="lock" size={16} /> {t("This page is private. Anyone with its link can manage the request, so keep it safe.")}
      </p>
      <RequestDetail request={request} access={{ kind: "manage", token }} t={t} lang={lang} />
    </section>
  );
}
