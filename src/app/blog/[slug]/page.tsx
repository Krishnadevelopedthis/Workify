import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InfoPage } from "@/components/InfoPage";
import { POSTS } from "@/lib/blog";

export const dynamicParams = false;
export const generateStaticParams = () => POSTS.map((p) => ({ slug: p.slug }));

export async function generateMetadata({ params }: PageProps<"/blog/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: POSTS.find((p) => p.slug === slug)?.title };
}

export default async function PostPage({ params }: PageProps<"/blog/[slug]">) {
  const { slug } = await params;
  const post = POSTS.find((p) => p.slug === slug);
  if (!post) notFound();
  return (
    <InfoPage icon="news" title={post.title} subtitle={new Date(post.date).toLocaleDateString(undefined, { dateStyle: "long" })}>
      <div className="prose-page">
        {post.body.map((para) => <p key={para}>{para}</p>)}
      </div>
      <Link href="/blog" className="mt-8 inline-block font-semibold text-brand">← All posts</Link>
    </InfoPage>
  );
}
