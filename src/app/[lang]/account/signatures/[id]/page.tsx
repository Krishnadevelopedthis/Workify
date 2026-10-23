import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { RequestDetail } from "@/components/sign/RequestDetail";
import { Link } from "@/i18n/Link";
import { getT } from "@/i18n/server";
import { requireUser } from "@/server/require-user";
import { getRequest } from "@/server/sign-requests";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("Signature request"), robots: { index: false } };
}

export default async function SignatureRequestPage({ params }: PageProps<"/[lang]/account/signatures/[id]">) {
  const { id } = await params;
  const { t, lang } = await getT();
  const user = await requireUser("/account/signatures");
  const request = getRequest(id);
  if (!request || request.owner_id !== user.id) notFound();
  return (
    <div className="mt-6">
      <Link href="/account/signatures" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-brand"><Icon name="arrow-left" size={16} className="rtl:rotate-180" /> {t("All signature requests")}</Link>
      <RequestDetail request={request} access={{ kind: "account", id }} t={t} lang={lang} />
    </div>
  );
}
