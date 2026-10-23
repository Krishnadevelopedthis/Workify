import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { localePath } from "@/i18n/config";
import { getT } from "@/i18n/server";
import { currentUser } from "@/server/auth";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("Login"), robots: { index: false } };
}

export default async function LoginPage({ searchParams }: PageProps<"/[lang]/login">) {
  const next = String((await searchParams).next ?? "/");
  const { lang } = await getT();
  if (await currentUser()) redirect(localePath(lang, "/"));
  return <AuthForm mode="login" next={next} />;
}
