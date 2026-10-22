import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/InfoPage";
import { ToolIcon } from "@/components/ToolIcon";
import { ALL_TOOLS_MENU, TOOL_BY_SLUG } from "@/lib/tools";

export const metadata: Metadata = { title: "All PDF tools" };

export default function ToolsPage() {
  const groups = { ...ALL_TOOLS_MENU, Workflows: ["create-workflow"] };
  return (
    <InfoPage icon="layout-grid" title="All PDF tools" subtitle="Every Workify tool, grouped by what it does." wide>
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(groups).map(([group, slugs]) => (
          <div key={group}>
            <h2 className="mb-3 text-sm font-bold tracking-wide text-muted uppercase">{group}</h2>
            <ul className="space-y-1">
              {slugs.map((s) => {
                const t = TOOL_BY_SLUG.get(s)!;
                return (
                  <li key={s}>
                    <Link href={`/${s}`} className="flex items-center gap-3 rounded-lg p-2 hover:bg-white">
                      <ToolIcon tool={t} size={30} />
                      <span className="font-medium">{t.name}</span>
                    </Link>
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
