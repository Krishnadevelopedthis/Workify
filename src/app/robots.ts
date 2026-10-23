import type { MetadataRoute } from "next";
import { LOCALES, localePath } from "@/i18n/config";
import { SITE_URL } from "@/lib/site";

const PRIVATE = ["/sign/", "/account", "/admin", "/login", "/signup"];

export default function robots(): MetadataRoute.Robots {
  return {
    // Private and per-user pages are kept out of search results, in every language.
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", ...LOCALES.flatMap((l) => PRIVATE.map((p) => localePath(l, p)))],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
