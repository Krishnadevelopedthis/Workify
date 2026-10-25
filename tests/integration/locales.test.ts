// Localized pages: every page below is served in all 11 interface languages
// with the right <html lang> and <html dir>, a translated title, a canonical
// URL in that language and hreflang links to every other language.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, LOCALES, localePath, RTL_LOCALES, type Locale } from "../../src/i18n/config";
import { baseHeaders, url } from "./helpers";

/** Indexable pages (they carry canonical + hreflang links). */
const INDEXED = ["/", "/tools", "/merge-pdf", "/compress-pdf", "/pricing", "/faq"];
/** Pages that are localized but noindex (no canonical required). */
const NOINDEX = ["/login", "/signup"];

function messages(lang: Locale): Record<string, string> {
  if (lang === DEFAULT_LOCALE) return {};
  return JSON.parse(readFileSync(new URL(`../../src/i18n/messages/${lang}.json`, import.meta.url), "utf8"));
}
const tr = (lang: Locale, s: string) => messages(lang)[s] ?? s;

function decode(s: string) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function htmlAttrs(html: string) {
  const tag = html.match(/<html\b[^>]*>/i)?.[0] ?? "";
  return {
    tag,
    lang: tag.match(/\blang="([^"]*)"/)?.[1] ?? null,
    dir: tag.match(/\bdir="([^"]*)"/)?.[1] ?? null,
  };
}

const title = (html: string) => decode(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "");
const canonical = (html: string) => html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? null;
function hreflangs(html: string) {
  const out: Record<string, string> = {};
  for (const m of html.matchAll(/<link rel="alternate" hrefLang="([^"]+)" href="([^"]+)"/g)) out[m[1]] = m[2];
  return out;
}
const pathOf = (href: string) => new URL(href).pathname;

async function getPage(path: string) {
  const res = await fetch(url(path), { headers: baseHeaders(), redirect: "manual" });
  return { res, html: await res.text() };
}

for (const lang of LOCALES) {
  const dir = RTL_LOCALES.includes(lang) ? "rtl" : "ltr";

  describe(`locale ${lang} (${dir})`, () => {
    for (const page of [...INDEXED, ...NOINDEX]) {
      const path = localePath(lang, page);
      it(`GET ${path} -> 200, lang="${lang}" dir="${dir}"`, async () => {
        const { res, html } = await getPage(path);
        expect(res.status, `${path}: ${html.slice(0, 200)}`).toBe(200);
        expect(res.headers.get("content-type")).toMatch(/text\/html/);
        const attrs = htmlAttrs(html);
        expect(attrs.lang, attrs.tag).toBe(lang);
        expect(attrs.dir, attrs.tag).toBe(dir);
        expect(title(html)).toMatch(/Workify/);

        if (INDEXED.includes(page)) {
          const c = canonical(html);
          expect(c, "canonical link").not.toBeNull();
          expect(pathOf(c!)).toBe(path);
          const alt = hreflangs(html);
          expect(Object.keys(alt).sort()).toEqual([...LOCALES, "x-default"].sort());
          for (const l of LOCALES) expect(pathOf(alt[l])).toBe(localePath(l, page));
          expect(pathOf(alt["x-default"])).toBe(page);
        }
      });
    }

    it("the home page title is translated", async () => {
      const { html } = await getPage(localePath(lang, "/"));
      expect(title(html)).toBe(`Workify | ${tr(lang, "Online PDF tools for everyone")}`);
    });
  });
}

describe("locale routing", () => {
  it("/en and /en/... redirect (308) to the unprefixed English URL, keeping the query", async () => {
    const home = await fetch(url("/en"), { redirect: "manual", headers: baseHeaders() });
    expect(home.status).toBe(308);
    expect(new URL(home.headers.get("location")!, url("/")).pathname).toBe("/");
    const pricing = await fetch(url("/en/pricing?x=1"), { redirect: "manual", headers: baseHeaders() });
    expect(pricing.status).toBe(308);
    const loc = new URL(pricing.headers.get("location")!, url("/"));
    expect(loc.pathname + loc.search).toBe("/pricing?x=1");
  });

  it("an unknown language prefix or page is a 404", async () => {
    expect((await getPage("/xx")).res.status).toBe(404);
    expect((await getPage("/xx/merge-pdf")).res.status).toBe(404);
    expect((await getPage("/es/no-such-page")).res.status).toBe(404);
    expect((await getPage("/no-such-page")).res.status).toBe(404);
  });

  it("a 404 under a language uses the localized not-found page", async () => {
    for (const lang of ["ru", "ar"] as const) {
      const { res, html } = await getPage(`/${lang}/no-such-page`);
      expect(res.status).toBe(404);
      const attrs = htmlAttrs(html);
      expect(attrs.lang).toBe(lang);
      expect(attrs.dir).toBe(lang === "ar" ? "rtl" : "ltr");
      expect(decode(html)).toContain(tr(lang, "This page could not be found"));
    }
  });
});
