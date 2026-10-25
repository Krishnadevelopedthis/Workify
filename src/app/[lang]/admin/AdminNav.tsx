"use client";

import { usePathname } from "next/navigation";
import { HoverLink } from "@/components/HoverLink";
import { Icon } from "@/components/Icon";
import { useT } from "@/i18n/client";
import { splitLocale } from "@/i18n/config";

const ITEMS = [
  { href: "/admin", icon: "layout-dashboard", label: "Dashboard" },
  { href: "/admin/analytics", icon: "chart-bar", label: "Analytics" },
  { href: "/admin/users", icon: "users", label: "Users" },
  { href: "/admin/messages", icon: "inbox", label: "Messages" },
  { href: "/admin/emails", icon: "mail", label: "Emails" },
  { href: "/admin/signatures", icon: "signature", label: "Signatures" },
  { href: "/admin/errors", icon: "alert-circle", label: "Errors" },
  { href: "/admin/waitlist", icon: "crown", label: "Premium waitlist" },
  { href: "/admin/backups", icon: "database", label: "Backups" },
  { href: "/admin/system", icon: "settings", label: "System" },
];

export function AdminNav() {
  const t = useT();
  const path = splitLocale(usePathname())[1];
  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col">
      {ITEMS.map((i) => {
        const active = i.href === "/admin" ? path === "/admin" : path.startsWith(i.href);
        return (
          <HoverLink
            key={i.href}
            href={i.href}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap ${active ? "bg-brand text-white" : "hover:bg-white"}`}
          >
            <Icon name={i.icon} size={18} /> {t(i.label)}
          </HoverLink>
        );
      })}
    </nav>
  );
}
