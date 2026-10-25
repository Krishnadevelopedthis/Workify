import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";
import { LOCALE_TAGS } from "@/i18n/config";
import { Link } from "@/i18n/Link";
import { alternates } from "@/i18n/seo";
import { getT } from "@/i18n/server";
import { POSTS } from "@/lib/blog";

export async function generateMetadata(): Promise<Metadata> {
  const { t, lang } = await getT();
  return { title: t("Blog"), alternates: alternates(lang, "/blog") };
}

export default async function BlogPage() {
  const { t, lang } = await getT();
  return (
    <InfoPage icon="news" title={t("Workify blog")} subtitle={t("Tips and guides for working with PDFs.")}>
      <div className="space-y-5">
        {POSTS.map((p) => (
          <Link key={p.slug} href={`/blog/${p.slug}`} className="group block rounded-2xl border border-line bg-white p-6 hover:shadow-md">
            <p className="text-xs text-muted">{new Date(p.date).toLocaleDateString(LOCALE_TAGS[lang], { dateStyle: "long" })}</p>
            <h2 className="mt-1 text-xl font-bold"><span className="wf-underline">{t(p.title)}</span></h2>
            <p className="mt-2 text-muted">{t(p.excerpt)}</p>
          </Link>
        ))}
      </div>
    </InfoPage>
  );
}
