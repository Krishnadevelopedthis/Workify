"use client";

import { usePathname, useRouter } from "next/navigation";
import { useLang, useT } from "@/i18n/client";
import { LOCALE_NAMES, LOCALES, localePath, splitLocale, type Locale } from "@/i18n/config";
import { Icon } from "./Icon";

/** Switches the interface language and stays on the same page. */
export function LanguageSwitcher() {
  const lang = useLang();
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  return (
    <label className="flex items-center gap-2 text-sm text-white/80">
      <Icon name="world" size={18} />
      <span className="sr-only">{t("Language")}</span>
      <select
        value={lang}
        onChange={(e) => {
          const [, path] = splitLocale(pathname);
          const next = e.target.value as Locale;
          router.push(localePath(next, path) + window.location.search);
        }}
        className="rounded-md border border-white/20 bg-transparent px-2 py-1 text-white [&>option]:text-ink"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
