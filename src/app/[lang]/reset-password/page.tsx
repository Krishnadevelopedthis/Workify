import type { Metadata } from "next";
import { AuthCard } from "@/components/AuthForm";
import { Link } from "@/i18n/Link";
import { getT } from "@/i18n/server";
import { peekToken } from "@/server/tokens";
import { ResetForm } from "./ResetForm";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("Choose a new password"), robots: { index: false } };
}

export default async function ResetPasswordPage({ searchParams }: PageProps<"/[lang]/reset-password">) {
  const { t } = await getT();
  const token = String((await searchParams).token ?? "");
  if (!peekToken(token, "reset")) {
    return (
      <AuthCard title={t("This link has expired")} subtitle={t("Reset links work once and expire after one hour.")}>
        <Link href="/forgot-password" className="btn-primary mt-6 w-full">{t("Send a new link")}</Link>
      </AuthCard>
    );
  }
  return <ResetForm token={token} />;
}
