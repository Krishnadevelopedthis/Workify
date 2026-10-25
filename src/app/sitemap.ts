import type { MetadataRoute } from "next";
import { DEFAULT_LOCALE, LOCALES, localePath } from "@/i18n/config";
import { POSTS } from "@/lib/blog";
import { SITE_URL } from "@/lib/site";
import { TOOLS } from "@/lib/tools";

const PAGES = [
  "/", "/tools", "/features", "/pricing", "/faq", "/security", "/privacy", "/terms", "/cookies",
  "/about", "/contact", "/blog", "/press", "/desktop", "/mobile", "/business", "/education",
];

type Entry = Omit<MetadataRoute.Sitemap[number], "url" | "alternates">;

const abs = (path: string) => `${SITE_URL}${path}`;

/** One entry per language for `path`, each listing the page in every language (hreflang). */
function localized(path: string, entry: Entry): MetadataRoute.Sitemap {
  const languages = {
    ...Object.fromEntries(LOCALES.map((l) => [l, abs(localePath(l, path))])),
    "x-default": abs(localePath(DEFAULT_LOCALE, path)),
  };
  return LOCALES.map((l) => ({ url: abs(localePath(l, path)), ...entry, alternates: { languages } }));
}

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...PAGES.flatMap((p) => localized(p, { changeFrequency: "monthly", priority: p === "/" ? 1 : 0.5 })),
    ...TOOLS.filter((t) => !t.unavailable).flatMap((t) => localized(`/${t.slug}`, { changeFrequency: "monthly", priority: 0.9 })),
    ...POSTS.flatMap((p) => localized(`/blog/${p.slug}`, { lastModified: p.date, priority: 0.4 })),
  ];
}
