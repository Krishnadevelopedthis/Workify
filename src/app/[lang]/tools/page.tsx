import type { Metadata } from "next";
import { HoverLink } from "@/components/HoverLink";
import { InfoPage } from "@/components/InfoPage";
import { ToolIcon } from "@/components/ToolIcon";
import { alternates } from "@/i18n/seo";
import { getT } from "@/i18n/server";
import { ALL_TOOLS_MENU, TOOL_BY_SLUG } from "@/lib/tools";

export async function generateMetadata(): Promise<Metadata> {
  const { t, lang } = await getT();
  return { title: t("All PDF tools"), alternates: alternates(lang, "/tools") };
}

export default async function ToolsPage() {
  const { t } = await getT();
  const groups = { ...ALL_TOOLS_MENU, Workflows: ["create-workflow"] };
  return (
    <InfoPage icon="layout-grid" title={t("All PDF tools")} subtitle={t("Every Workify tool, grouped by what it does.")} wide>
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(groups).map(([group, slugs]) => (
          <div key={group}>
            <h2 className="mb-3 text-sm font-bold tracking-wide text-muted uppercase">{t(group)}</h2>
            <ul className="space-y-1">
              {slugs.map((s) => {
                const tool = TOOL_BY_SLUG.get(s)!;
                return (
                  <li key={s}>
                    <HoverLink href={`/${s}`} className="flex items-center gap-3 rounded-lg p-2 hover:bg-white">
                      <ToolIcon tool={tool} size={30} />
                      <span className="font-medium">{t(tool.name)}</span>
                    </HoverLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </InfoPage>
  );
}
