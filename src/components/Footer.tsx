import { HoverLink } from "./HoverLink";
import { Icon } from "./Icon";
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

export function Footer() {
  return (
    <footer className="mt-auto bg-[#1f1f26] text-white/80">
      <div className="mx-auto grid max-w-[1440px] gap-8 px-6 py-12 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-1">
          <div className="inline-block rounded-lg bg-white px-3 py-2">
            <Logo />
          </div>
          <p className="mt-4 text-sm leading-6 text-white/60">
            Every tool you need to work with PDFs, free and in one place.
          </p>
        </div>
        {Object.entries(COLUMNS).map(([title, links]) => (
          <div key={title}>
            <p className="mb-3 text-sm font-bold tracking-wide text-white uppercase">{title}</p>
            <ul className="space-y-2">
              {links.map(([label, href]) => (
                <li key={href}>
                  <HoverLink href={href} className="text-sm hover:text-white">{label}</HoverLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-[1440px] flex-col items-center justify-between gap-4 px-6 py-5 sm:flex-row">
          <p className="text-xs text-white/50">© Workify {new Date().getFullYear()} · Your PDF Editor</p>
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
