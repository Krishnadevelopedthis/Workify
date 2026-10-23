import type { Locale } from "./config";

// Messages are keyed by the English text itself, so untranslated strings fall
// back to English and English needs no message file at all.
export type Messages = Record<string, string>;
export type Vars = Record<string, string | number>;
export type T = (text: string, vars?: Vars) => string;

export function translate(messages: Messages, text: string, vars?: Vars): string {
  const s = messages[text] || text;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

export const makeT =
  (messages: Messages): T =>
  (text, vars) =>
    translate(messages, text, vars);

const loaders: Record<Exclude<Locale, "en">, () => Promise<{ default: Messages }>> = {
  hi: () => import("./messages/hi.json"),
  es: () => import("./messages/es.json"),
  fr: () => import("./messages/fr.json"),
  de: () => import("./messages/de.json"),
  pt: () => import("./messages/pt.json"),
  ar: () => import("./messages/ar.json"),
  id: () => import("./messages/id.json"),
  ja: () => import("./messages/ja.json"),
  ru: () => import("./messages/ru.json"),
  zh: () => import("./messages/zh.json"),
};

export async function loadMessages(lang: Locale): Promise<Messages> {
  return lang === "en" ? {} : (await loaders[lang]()).default;
}
