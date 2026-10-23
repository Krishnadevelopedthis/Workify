import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InfoPage } from "@/components/InfoPage";
import { Icon } from "@/components/Icon";
import { LOCALE_TAGS } from "@/i18n/config";
import { Link } from "@/i18n/Link";
import { alternates } from "@/i18n/seo";
import { getT } from "@/i18n/server";
import { POSTS } from "@/lib/blog";

export const dynamicParams = false;
export const generateStaticParams = () => POSTS.map((p) => ({ slug: p.slug }));

export async function generateMetadata({ params }: PageProps<"/[lang]/blog/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const post = POSTS.find((p) => p.slug === slug);
  const { t, lang } = await getT();
  return { title: post && t(post.title), alternates: alternates(lang, `/blog/${slug}`) };
}

export default async function PostPage({ params }: PageProps<"/[lang]/blog/[slug]">) {
  const { slug } = await params;
  const post = POSTS.find((p) => p.slug === slug);
  if (!post) notFound();
  const { t, lang } = await getT();
  return (
    <InfoPage icon="news" title={t(post.title)} subtitle={new Date(post.date).toLocaleDateString(LOCALE_TAGS[lang], { dateStyle: "long" })}>
      <div className="prose-page">
        {post.body.map((para) => <p key={para}>{t(para)}</p>)}
      </div>
      <Link href="/blog" className="mt-8 inline-flex items-center gap-1 font-semibold text-brand"><Icon name="arrow-left" size={18} className="rtl:rotate-180" /> {t("All posts")}</Link>
    </InfoPage>
  );
}
