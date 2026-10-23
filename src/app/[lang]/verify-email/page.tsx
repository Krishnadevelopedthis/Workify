import type { Metadata } from "next";
import { AuthCard } from "@/components/AuthForm";
import { Icon } from "@/components/Icon";
import { Link } from "@/i18n/Link";
import { getT } from "@/i18n/server";
import { confirmEmail } from "@/server/tokens";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("Confirm email"), robots: { index: false } };
}

/** Confirms an address from an emailed link (?token=…, with &change=1 for a new address). */
export default async function VerifyEmailPage({ searchParams }: PageProps<"/[lang]/verify-email">) {
  const { t } = await getT();
  const params = await searchParams;
  const change = params.change === "1";
  const ok = confirmEmail(String(params.token ?? ""), change);

  if (!ok) {
    return (
      <AuthCard title={t("This link is invalid or has expired")} subtitle={t("Open your account page to send a new confirmation email.")}>
        <Link href="/account" className="btn-primary mt-6 w-full">{t("My account")}</Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={change ? t("Your email address has been changed") : t("Your email address is confirmed")}>
      <p className="mt-4 flex justify-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#6aa84f] text-white">
          <Icon name="check" size={32} />
        </span>
      </p>
      <Link href={change ? "/login" : "/account"} className="btn-primary mt-6 w-full">
        {change ? t("Log in") : t("Go to my account")}
      </Link>
    </AuthCard>
  );
}
