"use client";

import { createContext, use, useCallback, useEffect, type ReactNode } from "react";
import { DEFAULT_LOCALE, LOCALE_COOKIE, localePath, type Locale } from "./config";
import { translate, type Messages, type T } from "./translate";

const I18nContext = createContext<{ lang: Locale; messages: Messages }>({ lang: DEFAULT_LOCALE, messages: {} });

export function I18nProvider({ lang, messages, children }: { lang: Locale; messages: Messages; children: ReactNode }) {
  // Server actions, API errors and emails read the language from this cookie.
  useEffect(() => {
    document.cookie = `${LOCALE_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
  }, [lang]);
  return <I18nContext value={{ lang, messages }}>{children}</I18nContext>;
}

export function useLang(): Locale {
  return use(I18nContext).lang;
}

export function useT(): T {
  const { messages } = use(I18nContext);
  return useCallback<T>((text, vars) => translate(messages, text, vars), [messages]);
}

/** Prefixes a site path with the current language. */
export function useLocalePath() {
  const lang = useLang();
  return useCallback((path: string) => localePath(lang, path), [lang]);
}
