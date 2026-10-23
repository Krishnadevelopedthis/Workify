import { Link } from "@/i18n/Link";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

export function InfoPage({
  icon,
  title,
  subtitle,
  children,
  wide = false,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div>
      <section className="border-b border-line bg-white px-4 py-14 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10 text-brand">
          <Icon name={icon} size={30} />
        </span>
        <h1 className="mt-4 text-3xl font-bold sm:text-4xl">{title}</h1>
        {subtitle && <p className="mx-auto mt-3 max-w-2xl text-lg text-muted">{subtitle}</p>}
      </section>
      <section className={`mx-auto px-4 py-12 ${wide ? "max-w-6xl" : "max-w-3xl"}`}>{children}</section>
    </div>
  );
}

export function FeatureGrid({ items }: { items: { icon: string; title: string; text: string }[] }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((f) => (
        <div key={f.title} className="rounded-2xl border border-line bg-white p-6">
          <Icon name={f.icon} size={30} className="text-brand" />
          <h3 className="mt-3 font-bold">{f.title}</h3>
          <p className="mt-1 text-sm leading-6 text-muted">{f.text}</p>
        </div>
      ))}
    </div>
  );
}

export function Cta({ title, text, href, label }: { title: string; text: string; href: string; label: string }) {
  return (
    <div className="mt-12 rounded-3xl bg-gradient-to-br from-brand to-accent p-10 text-center text-white">
      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-white/90">{text}</p>
      <Link href={href} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 font-semibold text-brand">
        {label} <Icon name="arrow-right" size={18} className="rtl:rotate-180" />
      </Link>
    </div>
  );
}
