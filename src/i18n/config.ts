// Languages of the interface. English pages have no URL prefix (/merge-pdf);
// every other language lives under its code (/hi/merge-pdf).

export const LOCALES = ["en", "hi", "es", "fr", "de", "pt", "ar", "id", "ja", "ru", "zh"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  hi: "हिन्दी",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  pt: "Português",
  ar: "العربية",
  id: "Bahasa Indonesia",
  ja: "日本語",
  ru: "Русский",
  zh: "中文",
};

/** BCP 47 tags for dates and numbers. */
export const LOCALE_TAGS: Record<Locale, string> = {
  en: "en-US",
  hi: "hi-IN",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
  pt: "pt-BR",
  ar: "ar",
  id: "id-ID",
  ja: "ja-JP",
  ru: "ru-RU",
  zh: "zh-CN",
};

export const RTL_LOCALES: readonly Locale[] = ["ar"];

/** Set by src/proxy.ts on page requests: the language in the URL (overwrites any client value). */
export const PAGE_LANG_HEADER = "x-wf-page-lang";

/** Remembers the visitor's language for server actions, API errors and emails. */
export const LOCALE_COOKIE = "wf_lang";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** "/merge-pdf" in Hindi -> "/hi/merge-pdf". External and non-path links are returned unchanged. */
export function localePath(lang: Locale, path: string): string {
  if (!path.startsWith("/") || path.startsWith("//") || lang === DEFAULT_LOCALE) return path;
  return path === "/" ? `/${lang}` : `/${lang}${path}`;
}

/** "/hi/merge-pdf" -> ["hi", "/merge-pdf"]; "/merge-pdf" -> ["en", "/merge-pdf"]. */
export function splitLocale(pathname: string): [Locale, string] {
  const first = pathname.split("/")[1];
  if (isLocale(first) && first !== DEFAULT_LOCALE) {
    return [first, pathname.slice(first.length + 1) || "/"];
  }
  return [DEFAULT_LOCALE, pathname];
}
