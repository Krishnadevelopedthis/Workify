import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { requireAdmin } from "@/server/admin";
import { AdminNav } from "./AdminNav";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

export default async function AdminLayout({ children }: LayoutProps<"/[lang]/admin">) {
  await requireAdmin();
  const { t } = await getT();
  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-6 px-4 py-8 lg:flex-row">
      <aside className="shrink-0 lg:w-56">
        <p className="mb-3 px-3 text-xs font-bold tracking-wide text-muted uppercase">{t("Admin panel")}</p>
        <AdminNav />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
