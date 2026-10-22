import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolRunner } from "@/components/tool/ToolRunner";
import { TOOLS, TOOL_BY_SLUG } from "@/lib/tools";

export const dynamicParams = false;

export function generateStaticParams() {
  return TOOLS.map((t) => ({ tool: t.slug }));
}

export async function generateMetadata({ params }: PageProps<"/[tool]">): Promise<Metadata> {
  const tool = TOOL_BY_SLUG.get((await params).tool);
  if (!tool) return {};
  return {
    title: `${tool.name} online, free`,
    description: tool.description,
    alternates: { canonical: `/${tool.slug}` },
    openGraph: { title: `${tool.name} | Workify`, description: tool.description, url: `/${tool.slug}` },
    robots: tool.unavailable ? { index: false } : undefined,
  };
}

export default async function ToolPage({ params }: PageProps<"/[tool]">) {
  const { tool } = await params;
  if (!TOOL_BY_SLUG.has(tool)) notFound();
  return <ToolRunner slug={tool} />;
}
