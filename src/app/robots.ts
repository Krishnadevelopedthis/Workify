import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    // Private and per-user pages are kept out of search results.
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/sign/", "/account", "/login", "/signup"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
