import { lang as rootLang } from "next/root-params";
import { DEFAULT_LOCALE, isLocale, type Locale } from "./config";
import { loadMessages, makeT, type T } from "./translate";

// For Server Components under app/[lang]. Route handlers and server actions
// have no root params; they use ./request instead.

export async function getLang(): Promise<Locale> {
  const l = await rootLang();
  return isLocale(l) ? l : DEFAULT_LOCALE;
}

export async function getT(): Promise<{ t: T; lang: Locale }> {
  const lang = await getLang();
  return { t: makeT(await loadMessages(lang)), lang };
}
