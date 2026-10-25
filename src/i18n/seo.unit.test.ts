import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, LOCALES } from "./config";
import { alternates } from "./seo";

type Alt = { canonical: string; languages: Record<string, string> };

describe("alternates", () => {
  it("points English at the unprefixed path and lists every language plus x-default", () => {
    const a = alternates("en", "/merge-pdf") as Alt;
    expect(a.canonical).toBe("/merge-pdf");
    expect(Object.keys(a.languages).sort()).toEqual([...LOCALES, "x-default"].sort());
    expect(a.languages["x-default"]).toBe("/merge-pdf");
    expect(a.languages.en).toBe("/merge-pdf");
    expect(a.languages.hi).toBe("/hi/merge-pdf");
    expect(a.languages.zh).toBe("/zh/merge-pdf");
  });

  it("uses the page's own language as canonical", () => {
    const a = alternates("ar", "/pricing") as Alt;
    expect(a.canonical).toBe("/ar/pricing");
    // hreflang alternates do not depend on the page language.
    expect(a.languages).toEqual((alternates("en", "/pricing") as Alt).languages);
  });

  it("maps the home page to /<lang> without a trailing slash", () => {
    const a = alternates("fr", "/") as Alt;
    expect(a.canonical).toBe("/fr");
    expect(a.languages.en).toBe("/");
    expect(a.languages["x-default"]).toBe("/");
    expect(a.languages.de).toBe("/de");
  });

  it("gives every language a distinct URL", () => {
    const a = alternates(DEFAULT_LOCALE, "/blog/how-to-merge") as Alt;
    const urls = LOCALES.map((l) => a.languages[l]);
    expect(new Set(urls).size).toBe(LOCALES.length);
  });

  it("leaves external and protocol-relative links untouched", () => {
    const a = alternates("hi", "https://example.com/x") as Alt;
    expect(a.canonical).toBe("https://example.com/x");
    expect((alternates("hi", "//evil.example/x") as Alt).canonical).toBe("//evil.example/x");
  });

  it("keeps query strings and unicode paths", () => {
    expect((alternates("ja", "/tools?cat=edit") as Alt).canonical).toBe("/ja/tools?cat=edit");
    expect((alternates("hi", "/ब्लॉग") as Alt).canonical).toBe("/hi/ब्लॉग");
  });
});
