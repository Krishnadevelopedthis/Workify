import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/InfoPage";
import { POSTS } from "@/lib/blog";

export const metadata: Metadata = { title: "Blog" };

export default function BlogPage() {
  return (
    <InfoPage icon="news" title="Workify blog" subtitle="Tips and guides for working with PDFs.">
      <div className="space-y-5">
        {POSTS.map((p) => (
          <Link key={p.slug} href={`/blog/${p.slug}`} className="block rounded-2xl border border-line bg-white p-6 hover:shadow-md">
            <p className="text-xs text-muted">{new Date(p.date).toLocaleDateString(undefined, { dateStyle: "long" })}</p>
            <h2 className="mt-1 text-xl font-bold">{p.title}</h2>
            <p className="mt-2 text-muted">{p.excerpt}</p>
          </Link>
        ))}
      </div>
    </InfoPage>
  );
}
