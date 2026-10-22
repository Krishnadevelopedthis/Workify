import type { MetadataRoute } from "next";
import { POSTS } from "@/lib/blog";
import { SITE_URL } from "@/lib/site";
import { TOOLS } from "@/lib/tools";

const PAGES = [
  "", "tools", "features", "pricing", "faq", "security", "privacy", "terms", "cookies",
  "about", "contact", "blog", "press", "desktop", "mobile", "business", "education",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...PAGES.map((p) => ({ url: `${SITE_URL}/${p}`, changeFrequency: "monthly" as const, priority: p === "" ? 1 : 0.5 })),
    ...TOOLS.filter((t) => !t.unavailable).map((t) => ({ url: `${SITE_URL}/${t.slug}`, changeFrequency: "monthly" as const, priority: 0.9 })),
    ...POSTS.map((p) => ({ url: `${SITE_URL}/blog/${p.slug}`, lastModified: p.date, priority: 0.4 })),
  ];
}
