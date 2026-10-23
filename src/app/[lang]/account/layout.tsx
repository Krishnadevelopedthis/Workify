import { redirect } from "next/navigation";
import { localePath } from "@/i18n/config";
import { getT } from "@/i18n/server";
import { currentUser } from "@/server/auth";
import { AccountTabs } from "./AccountTabs";

export default async function AccountLayout({ children }: LayoutProps<"/[lang]/account">) {
  const { t, lang } = await getT();
  if (!(await currentUser())) redirect(localePath(lang, "/login?next=/account"));
  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-12">
      <h1 className="text-3xl font-bold">{t("My account")}</h1>
      <AccountTabs />
      {children}
    </section>
  );
}
