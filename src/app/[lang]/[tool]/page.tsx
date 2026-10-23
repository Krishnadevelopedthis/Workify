import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolRunner } from "@/components/tool/ToolRunner";
import { alternates } from "@/i18n/seo";
import { getT } from "@/i18n/server";
import { TOOLS, TOOL_BY_SLUG } from "@/lib/tools";

export const dynamicParams = false;

export function generateStaticParams() {
  return TOOLS.map((t) => ({ tool: t.slug }));
}

export async function generateMetadata({ params }: PageProps<"/[lang]/[tool]">): Promise<Metadata> {
  const tool = TOOL_BY_SLUG.get((await params).tool);
  if (!tool) return {};
  const { t, lang } = await getT();
  const name = t(tool.name);
  const description = t(tool.description);
  return {
    title: t("{tool} online, free", { tool: name }),
    description,
    alternates: alternates(lang, `/${tool.slug}`),
    openGraph: { title: `${name} | Workify`, description, url: `/${tool.slug}` },
    robots: tool.unavailable ? { index: false } : undefined,
  };
}

export default async function ToolPage({ params }: PageProps<"/[lang]/[tool]">) {
  const { tool } = await params;
  if (!TOOL_BY_SLUG.has(tool)) notFound();
  return <ToolRunner slug={tool} />;
}
