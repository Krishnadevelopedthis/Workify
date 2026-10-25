import { getT } from "@/i18n/server";
import { HoverLink } from "./HoverLink";
import { Icon } from "./Icon";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Logo } from "./Logo";

const COLUMNS: Record<string, [string, string][]> = {
  Workify: [
    ["Home", "/"],
    ["Features", "/features"],
    ["Pricing", "/pricing"],
    ["Tools", "/tools"],
    ["FAQ", "/faq"],
  ],
  Product: [
    ["Workify Desktop", "/desktop"],
    ["Workify Mobile", "/mobile"],
    ["Workflows", "/create-workflow"],
    ["Developers", "/developers"],
  ],
  Solutions: [
    ["Business", "/business"],
    ["Education", "/education"],
  ],
  Legal: [
    ["Security", "/security"],
    ["Privacy policy", "/privacy"],
    ["Terms & conditions", "/terms"],
    ["Cookies", "/cookies"],
  ],
  Company: [
    ["About us", "/about"],
    ["Contact us", "/contact"],
    ["Blog", "/blog"],
    ["Press", "/press"],
  ],
};

const SOCIAL = [
  ["brand-x", "X (Twitter)"],
  ["brand-facebook", "Facebook"],
  ["brand-linkedin", "LinkedIn"],
  ["brand-instagram", "Instagram"],
  ["brand-tiktok", "TikTok"],
  ["brand-reddit", "Reddit"],
];

export async function Footer() {
  const { t } = await getT();
  // Literal t() calls so the i18n extractor sees the headings.
  const headings: Record<string, string> = {
    Workify: "Workify",
    Product: t("Product"),
    Solutions: t("Solutions"),
    Legal: t("Legal"),
    Company: t("Company"),
  };
  return (
    <footer className="mt-auto bg-[#1f1f26] text-white/80">
      <div className="mx-auto grid max-w-[1440px] gap-8 px-6 py-12 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-1">
          <div className="inline-block rounded-lg bg-white px-3 py-2">
            <Logo />
          </div>
          <p className="mt-4 text-sm leading-6 text-white/60">
            {t("Every tool you need to work with PDFs, free and in one place.")}
          </p>
        </div>
        {Object.entries(COLUMNS).map(([title, links]) => (
          <div key={title}>
            <p className="mb-3 text-sm font-bold tracking-wide text-white uppercase">{headings[title]}</p>
            <ul className="space-y-2">
              {links.map(([label, href]) => (
                <li key={href}>
                  <HoverLink href={href} className="wf-underline text-sm hover:text-white">{t(label)}</HoverLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-[1440px] flex-col items-center justify-between gap-4 px-6 py-5 sm:flex-row">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-6">
            <LanguageSwitcher />
            <p className="text-xs text-white/50">© Workify {new Date().getFullYear()} · {t("Your PDF Editor")}</p>
          </div>
          <div className="flex gap-3">
            {SOCIAL.map(([icon, label]) => (
              <span key={icon} title={label} className="rounded-full bg-white/10 p-2 text-white/70">
                <Icon name={icon} size={16} />
                <span className="sr-only">{label}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
