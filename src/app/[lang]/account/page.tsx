import type { Metadata } from "next";
import { listWorkflows } from "@/app/actions/workflows";
import { Icon } from "@/components/Icon";
import { LOCALE_TAGS } from "@/i18n/config";
import { Link } from "@/i18n/Link";
import { getT } from "@/i18n/server";
import { TOOL_BY_SLUG } from "@/lib/tools";
import { requireUser } from "@/server/require-user";
import { DeleteAccount, EmailForm, NameForm, PasswordForm, VerifyBanner, WorkflowList } from "./AccountForms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("My account"), robots: { index: false } };
}

export default async function AccountPage({ searchParams }: PageProps<"/[lang]/account">) {
  const { t, lang } = await getT();
  const user = await requireUser("/account");
  const workflows = (await listWorkflows()) ?? [];
  const reset = (await searchParams).reset === "1";

  const card = "rounded-2xl border border-line bg-white p-6";
  return (
    <div className="mt-6 space-y-6">
      {reset && (
        <p className="flex items-center gap-2 rounded-xl bg-[#6aa84f]/10 px-4 py-3 text-sm font-semibold text-[#4a8a32]">
          <Icon name="check" size={18} /> {t("Your new password is saved. Other devices were signed out.")}
        </p>
      )}
      {!user.verified && <VerifyBanner email={user.email} />}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <div className={card}>
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-2xl font-bold text-white">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <p className="mt-3 text-lg font-bold">{user.name}</p>
            <p className="flex items-center gap-1.5 text-sm text-muted">
              {user.email}
              {user.verified && <Icon name="circle-check" size={16} className="text-[#6aa84f]" />}
            </p>
            <p className="mt-3 text-xs text-muted">
              {t("Member since {date}", { date: new Date(user.createdAt).toLocaleDateString(LOCALE_TAGS[lang]) })}
            </p>
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
              <Icon name="crown" size={14} /> {t("Free plan · Premium coming soon")}
            </p>
          </div>
          <div className={card}>
            <h2 className="mb-3 font-bold">{t("Name")}</h2>
            <NameForm name={user.name} />
          </div>
          <div className={card}>
            <h2 className="mb-3 font-bold">{t("Email address")}</h2>
            <EmailForm />
          </div>
          <div className={card}>
            <h2 className="mb-3 font-bold">{t("Password")}</h2>
            <PasswordForm />
          </div>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <div className={card}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold">{t("My workflows")}</h2>
              <Link href="/create-workflow" className="text-sm font-semibold text-brand">+ {t("New workflow")}</Link>
            </div>
            <WorkflowList
              workflows={workflows.map((w) => ({ id: w.id, name: w.name, steps: w.steps.map((s) => TOOL_BY_SLUG.get(s.tool)?.name ?? s.tool) }))}
            />
          </div>
          <div className="rounded-2xl border border-brand/30 bg-white p-6">
            <h2 className="mb-1 font-bold text-brand">{t("Delete account")}</h2>
            <p className="mb-4 text-sm text-muted">
              {t("This permanently deletes your account, workflows, signature templates, API keys and signature requests. It cannot be undone.")}
            </p>
            <DeleteAccount />
          </div>
        </div>
      </div>
    </div>
  );
}
