import type { Metadata } from "next";
import { Icon } from "@/components/Icon";
import { ToolGrid } from "@/components/ToolGrid";
import { Link } from "@/i18n/Link";
import { alternates } from "@/i18n/seo";
import { getT } from "@/i18n/server";

const PROMOS = [
  {
    href: "/desktop",
    icon: "device-desktop",
    title: "Workify on your computer",
    text: "Install Workify as an app on Windows, macOS or Linux and open your tools in one click.",
  },
  {
    href: "/mobile",
    icon: "device-mobile",
    title: "Workify on your phone",
    text: "Scan, sign and convert documents from your phone, with the same tools as on desktop.",
  },
  {
    href: "/business",
    icon: "building",
    title: "Workify for teams",
    text: "Save workflows, collect signatures and run Workify on your own server.",
  },
];

const TRUST = [
  { icon: "heart", title: "Free forever", text: "Every Workify tool is 100% free. No watermarks, no trials." },
  { icon: "shield-check", title: "Private by design", text: "Files are processed on our server and deleted after one hour." },
  { icon: "bolt", title: "Fast and simple", text: "Upload, choose your options and download. That's it." },
];

export async function generateMetadata(): Promise<Metadata> {
  const { lang } = await getT();
  return { alternates: alternates(lang, "/") };
}

export default async function Home() {
  const { t } = await getT();
  return (
    <div className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-brand/5" />
      <div aria-hidden className="pointer-events-none absolute top-40 -right-40 h-[420px] w-[420px] rounded-full bg-accent/5" />

      <section className="relative mx-auto max-w-[1440px] px-4 pt-12 pb-16 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-5xl">
            {t("All your PDF tools, together and free")}
          </h1>
          <p className="mt-5 text-lg leading-8 text-muted sm:text-xl">
            {t("Merge, split, compress, convert, edit, sign and protect PDF files right in your browser. Pick a tool, drop in your files and download the result in seconds.")}
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
              <h2 className="mt-4 text-xl font-bold">{t(p.title)}</h2>
              <p className="mt-2 text-muted">{t(p.text)}</p>
              <span className="mt-4 inline-flex items-center gap-1 font-semibold text-brand-dark">
                <span className="wf-underline">{t("Learn more")}</span> <Icon name="arrow-right" size={16} className="rtl:rotate-180" />
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
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase">
                  <Icon name="crown" size={14} /> {t("Coming soon")}
                </span>
                <h2 className="mt-3 text-3xl font-bold">{t("Workify Premium is on its way")}</h2>
                <p className="mt-3 max-w-xl text-white/90">
                  {t("Today every tool and feature is free for everyone. Premium will add extras for heavy users and teams, and everything you can do now stays free.")}
                </p>
              </div>
              <Link href="/pricing" className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 font-semibold text-brand hover:bg-white/90">
                <Icon name="crown" size={20} /> {t("See plans")}
              </Link>
            </div>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {TRUST.map((item) => (
              <div key={item.title} className="flex gap-4">
                <Icon name={item.icon} size={32} className="shrink-0 text-brand" />
                <div>
                  <h3 className="font-bold">{t(item.title)}</h3>
                  <p className="mt-1 text-sm text-muted">{t(item.text)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
