import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { ToolGrid } from "@/components/ToolGrid";

const PROMOS = [
  {
    href: "/desktop",
    icon: "device-desktop",
    title: "Work offline with Desktop",
    text: "Batch edit and manage documents locally, with no internet and no limits.",
  },
  {
    href: "/mobile",
    icon: "device-mobile",
    title: "On-the-go with Mobile",
    text: "Your favorite tools, right in your pocket. Keep working on your projects anywhere.",
  },
  {
    href: "/business",
    icon: "building",
    title: "Built for business",
    text: "Automate document management, onboard teams easily, and scale with flexible plans.",
  },
];

const TRUST = [
  { icon: "heart", title: "Free forever", text: "Every Workify tool is 100% free. No watermarks, no trials." },
  { icon: "shield-check", title: "Private by design", text: "Files are processed on our server and deleted after one hour." },
  { icon: "bolt", title: "Fast and simple", text: "Upload, choose your options and download. That's it." },
];

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function Home() {
  return (
    <div className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-brand/5" />
      <div aria-hidden className="pointer-events-none absolute top-40 -right-40 h-[420px] w-[420px] rounded-full bg-accent/5" />

      <section className="relative mx-auto max-w-[1440px] px-4 pt-12 pb-16 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-5xl">
            Every tool you need to work with PDFs in one place
          </h1>
          <p className="mt-5 text-lg leading-8 text-muted sm:text-xl">
            Every tool you need to use PDFs, at your fingertips. All are 100% FREE and easy to use! Merge,
            split, compress, convert, rotate, unlock and watermark PDFs with just a few clicks.
          </p>
        </div>
        <div className="mt-10">
          <ToolGrid />
        </div>
      </section>

      <section className="relative bg-white py-16">
        <div className="mx-auto grid max-w-[1200px] gap-6 px-4 md:grid-cols-3">
          {PROMOS.map((p) => (
            <Link key={p.href} href={p.href} className="group rounded-2xl border border-line bg-bg p-8 transition hover:shadow-lg">
              <Icon name={p.icon} size={40} className="text-brand" />
              <h2 className="mt-4 text-xl font-bold">{p.title}</h2>
              <p className="mt-2 text-muted">{p.text}</p>
              <span className="mt-4 inline-flex items-center gap-1 font-semibold text-brand-dark">
                Learn more <Icon name="arrow-right" size={16} />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="relative py-16">
        <div className="mx-auto max-w-[1200px] px-4">
          <div className="rounded-3xl bg-gradient-to-br from-brand to-accent p-10 text-white sm:p-14">
            <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
              <div>
                <h2 className="text-3xl font-bold">Get more with Premium</h2>
                <p className="mt-3 max-w-xl text-white/90">
                  Workify Premium is free for everyone right now: unlimited tasks, batch processing and every tool,
                  with no ads.
                </p>
              </div>
              <Link href="/pricing" className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 font-semibold text-brand hover:bg-white/90">
                <Icon name="crown" size={20} /> Get Premium
              </Link>
            </div>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {TRUST.map((t) => (
              <div key={t.title} className="flex gap-4">
                <Icon name={t.icon} size={32} className="shrink-0 text-brand" />
                <div>
                  <h3 className="font-bold">{t.title}</h3>
                  <p className="mt-1 text-sm text-muted">{t.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
