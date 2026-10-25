import type { Metadata } from "next";
import { headers } from "next/headers";
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/Logo";
import { DEFAULT_LOCALE, isLocale, localePath, PAGE_LANG_HEADER, RTL_LOCALES } from "@/i18n/config";
import { loadMessages, makeT } from "@/i18n/translate";
import "./globals.css";

// URLs that match no route never reach app/[lang]/layout.tsx, so this page
// renders on its own, in the language src/proxy.ts read from the URL.

export const metadata: Metadata = { robots: { index: false } };

export default async function GlobalNotFound() {
  const value = (await headers()).get(PAGE_LANG_HEADER);
  const lang = isLocale(value) ? value : DEFAULT_LOCALE;
  const t = makeT(await loadMessages(lang));
  return (
    <html lang={lang} dir={RTL_LOCALES.includes(lang) ? "rtl" : "ltr"}>
      <body className="flex min-h-screen flex-col bg-bg text-ink">
        <header className="border-b border-line bg-white px-6 py-4">
          <a href={localePath(lang, "/")} aria-label="Workify">
            <Logo />
          </a>
        </header>
        <main className="flex flex-1 flex-col items-center px-4 py-24 text-center">
          <p className="text-7xl font-extrabold text-brand">404</p>
          <h1 className="mt-4 text-2xl font-bold">{t("This page could not be found")}</h1>
          <p className="mt-2 text-muted">{t("The link may be broken, or the page may have moved.")}</p>
          <a href={localePath(lang, "/")} className="btn-primary mt-8">
            <Icon name="arrow-left" size={18} className="rtl:rotate-180" /> {t("Back to all tools")}
          </a>
        </main>
      </body>
    </html>
  );
}
