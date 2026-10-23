import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, isLocale, LOCALE_NAMES, LOCALE_TAGS, LOCALES, localePath, RTL_LOCALES, splitLocale } from "./config";

describe("isLocale", () => {
  it("accepts every configured locale", () => {
    for (const l of LOCALES) expect(isLocale(l)).toBe(true);
  });

  it("rejects anything else", () => {
    for (const v of ["", "EN", "hi-IN", "xx", "merge-pdf", undefined, null, 1, {}]) expect(isLocale(v)).toBe(false);
  });
});

describe("localePath", () => {
  it("leaves English paths unprefixed", () => {
    expect(localePath("en", "/merge-pdf")).toBe("/merge-pdf");
    expect(localePath("en", "/")).toBe("/");
  });

  it("prefixes other languages", () => {
    expect(localePath("hi", "/merge-pdf")).toBe("/hi/merge-pdf");
    expect(localePath("ar", "/blog/post?x=1#top")).toBe("/ar/blog/post?x=1#top");
    expect(localePath("ja", "/")).toBe("/ja");
  });

  it("returns external, protocol-relative and non-path links unchanged", () => {
    expect(localePath("fr", "https://example.com/a")).toBe("https://example.com/a");
    expect(localePath("fr", "//cdn.example.com/a")).toBe("//cdn.example.com/a");
    expect(localePath("fr", "mailto:hi@example.com")).toBe("mailto:hi@example.com");
    expect(localePath("fr", "#faq")).toBe("#faq");
  });
});

describe("splitLocale", () => {
  it("splits a language prefix off the path", () => {
    expect(splitLocale("/hi/merge-pdf")).toEqual(["hi", "/merge-pdf"]);
    expect(splitLocale("/zh/blog/post")).toEqual(["zh", "/blog/post"]);
    expect(splitLocale("/de")).toEqual(["de", "/"]);
    expect(splitLocale("/de/")).toEqual(["de", "/"]);
  });

  it("treats unprefixed paths as English", () => {
    expect(splitLocale("/merge-pdf")).toEqual(["en", "/merge-pdf"]);
    expect(splitLocale("/")).toEqual(["en", "/"]);
    expect(splitLocale("/hindi/page")).toEqual(["en", "/hindi/page"]);
  });

  it("does not treat an /en prefix as a language (English is unprefixed)", () => {
    expect(splitLocale("/en/merge-pdf")).toEqual(["en", "/en/merge-pdf"]);
  });

  it("round-trips with localePath", () => {
    for (const l of LOCALES) {
      for (const p of ["/", "/merge-pdf", "/blog/a-b"]) expect(splitLocale(localePath(l, p))).toEqual([l, p]);
    }
  });
});

describe("locale tables", () => {
  it("cover every locale", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    for (const l of LOCALES) {
      expect(LOCALE_NAMES[l]).toBeTruthy();
      expect(LOCALE_TAGS[l]).toBeTruthy();
    }
    expect(RTL_LOCALES).toEqual(["ar"]);
  });
});
