import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { InfoPage } from "@/components/InfoPage";

export const metadata: Metadata = { title: "Pricing" };

const PLANS = [
  {
    name: "Basic",
    price: "Free",
    note: "No account needed",
    cta: { label: "Start now", href: "/" },
    features: ["Every PDF tool", "Batch processing", "Files up to 200 MB", "Files deleted after 1 hour"],
  },
  {
    name: "Premium",
    price: "Free",
    note: "Normally a paid plan — free for everyone right now",
    highlight: true,
    cta: { label: "Create free account", href: "/signup" },
    features: ["Everything in Basic", "Save workflows to your account", "Track signature requests", "No ads, ever"],
  },
  {
    name: "Business",
    price: "Contact us",
    note: "For teams and organisations",
    cta: { label: "Contact us", href: "/contact" },
    features: ["Everything in Premium", "Team onboarding help", "Self-hosted deployment guidance", "Priority email support"],
  },
];

export default function PricingPage() {
  return (
    <InfoPage icon="crown" title="Plans & pricing" subtitle="Workify is free. Premium features are unlocked for every user while we grow." wide>
      <div className="grid gap-6 md:grid-cols-3">
        {PLANS.map((p) => (
          <div key={p.name} className={`flex flex-col rounded-2xl border bg-white p-7 ${p.highlight ? "border-brand shadow-xl shadow-brand/10" : "border-line"}`}>
            {p.highlight && <span className="mb-3 self-start rounded-full bg-brand px-3 py-1 text-xs font-bold text-white">Most popular</span>}
            <h2 className="text-xl font-bold">{p.name}</h2>
            <p className="mt-3 text-4xl font-extrabold">{p.price}</p>
            <p className="mt-1 text-sm text-muted">{p.note}</p>
            <ul className="mt-6 flex-1 space-y-2.5">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <Icon name="check" size={18} className="mt-0.5 shrink-0 text-[#6aa84f]" /> {f}
                </li>
              ))}
            </ul>
            <Link href={p.cta.href} className={`mt-8 ${p.highlight ? "btn-primary" : "btn-secondary"}`}>{p.cta.label}</Link>
          </div>
        ))}
      </div>
      <p className="mt-8 text-center text-sm text-muted">No credit card. No trial that runs out. If paid plans are ever introduced, everything you can do today stays free.</p>
    </InfoPage>
  );
}
