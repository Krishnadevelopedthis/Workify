import type { Metadata } from "next";
import { Icon } from "@/components/Icon";
import { InfoPage } from "@/components/InfoPage";
import { GlowBorder } from "@/components/ui/GlowBorder";
import { Link } from "@/i18n/Link";
import { alternates } from "@/i18n/seo";
import { getT } from "@/i18n/server";
import { PremiumWaitlist } from "./PremiumWaitlist";

const FREE_FEATURES = [
  "Every PDF tool",
  "Batch processing",
  "Files up to 200 MB",
  "Signature requests with audit trail",
  "Saved workflows",
  "Files deleted after 1 hour",
];

const PREMIUM_FEATURES = [
  "Everything in Free",
  "Files up to 4 GB",
  "Priority processing queue",
  "Your logo on signature emails",
  "Team accounts with shared workflows",
  "Priority support",
];

const BUSINESS_FEATURES = ["Everything in Premium", "Single sign-on (SSO)", "Self-hosted deployment help", "Custom contracts and invoicing"];

export async function generateMetadata(): Promise<Metadata> {
  const { t, lang } = await getT();
  return { title: t("Pricing"), alternates: alternates(lang, "/pricing") };
}

function Features({ items, t }: { items: string[]; t: (s: string) => string }) {
  return (
    <ul className="mt-6 flex-1 space-y-2.5">
      {items.map((f) => (
        <li key={f} className="flex items-start gap-2 text-sm">
          <Icon name="check" size={18} className="mt-0.5 shrink-0 text-[#6aa84f]" /> {t(f)}
        </li>
      ))}
    </ul>
  );
}

export default async function PricingPage() {
  const { t } = await getT();
  return (
    <InfoPage icon="crown" title={t("Plans & pricing")} subtitle={t("Workify is free for everyone today. Premium is coming soon.")} wide>
      <div className="grid gap-6 md:grid-cols-3">
        <div className="flex flex-col rounded-2xl border border-brand bg-white p-7 shadow-xl shadow-brand/10">
          <span className="mb-3 self-start rounded-full bg-brand px-3 py-1 text-xs font-bold text-white">{t("Available now")}</span>
          <h2 className="text-xl font-bold">{t("Free")}</h2>
          <p className="mt-3 text-4xl font-extrabold">₹0</p>
          <p className="mt-1 text-sm text-muted">{t("Every tool and feature, no account needed")}</p>
          <Features items={FREE_FEATURES} t={t} />
          <Link href="/" className="btn-primary mt-8">{t("Start now")}</Link>
        </div>

        <GlowBorder>
          <div className="relative flex flex-1 flex-col overflow-hidden rounded-[calc(1rem-1.5px)] bg-white p-7">
            <span className="mb-3 inline-flex items-center gap-1.5 self-start rounded-full bg-accent/15 px-3 py-1 text-xs font-bold text-accent">
              <Icon name="clock" size={14} /> {t("Coming soon")}
            </span>
            <h2 className="flex items-center gap-2 text-xl font-bold">
              <Icon name="crown" size={22} className="text-accent" /> {t("Premium")}
            </h2>
            <p className="mt-3 text-4xl font-extrabold text-muted">—</p>
            <p className="mt-1 text-sm text-muted">{t("For heavy users and teams. Pricing will be announced at launch.")}</p>
            <Features items={PREMIUM_FEATURES} t={t} />
            <PremiumWaitlist />
          </div>
        </GlowBorder>

        <div className="flex flex-col rounded-2xl border border-line bg-white p-7">
          <h2 className="mt-9 text-xl font-bold">{t("Business")}</h2>
          <p className="mt-3 text-4xl font-extrabold">{t("Custom")}</p>
          <p className="mt-1 text-sm text-muted">{t("For organisations with special requirements")}</p>
          <Features items={BUSINESS_FEATURES} t={t} />
          <Link href="/contact" className="btn-secondary mt-8">{t("Contact us")}</Link>
        </div>
      </div>
      <p className="mt-8 text-center text-sm text-muted">
        {t("No credit card. No trial that runs out. When Premium launches, everything you can do today stays free.")}
      </p>
    </InfoPage>
  );
}
