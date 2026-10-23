"use client";

import { usePathname } from "next/navigation";
import { HoverLink } from "@/components/HoverLink";
import { Icon } from "@/components/Icon";
import { useT } from "@/i18n/client";
import { splitLocale } from "@/i18n/config";

const TABS = [
  { href: "/account", icon: "user", label: "Profile" },
  { href: "/account/signatures", icon: "signature", label: "Signatures" },
  { href: "/account/developer", icon: "code", label: "Developer" },
];

export function AccountTabs() {
  const t = useT();
  const path = splitLocale(usePathname())[1];
  return (
    <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-line" aria-label={t("Account")}>
      {TABS.map((tab) => {
        const active = tab.href === "/account" ? path === "/account" : path.startsWith(tab.href);
        return (
          <HoverLink
            key={tab.href}
            href={tab.href}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap ${
              active ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            <Icon name={tab.icon} size={18} /> {t(tab.label)}
          </HoverLink>
        );
      })}
    </nav>
  );
}
