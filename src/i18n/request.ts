import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "./config";
import { loadMessages, makeT, type T } from "./translate";

/**
 * Language of the current request in route handlers and server actions: the
 * x-wf-lang header (sent by the app's fetches), else the language cookie.
 */
export async function requestLang(headers?: Headers): Promise<Locale> {
  const fromHeader = headers?.get("x-wf-lang");
  if (isLocale(fromHeader)) return fromHeader;
  try {
    const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
    if (isLocale(fromCookie)) return fromCookie;
  } catch {
    // No request scope (e.g. a background task).
  }
  return DEFAULT_LOCALE;
}

export async function requestT(headers?: Headers): Promise<{ t: T; lang: Locale }> {
  const lang = await requestLang(headers);
  return { t: makeT(await loadMessages(lang)), lang };
}

export async function tFor(lang: Locale): Promise<T> {
  return makeT(await loadMessages(lang));
}
