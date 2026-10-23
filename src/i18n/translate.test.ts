import { describe, expect, it } from "vitest";
import { LOCALES } from "./config";
import { loadMessages, makeT, translate } from "./translate";

// Test strings avoid t("…") and { name: "…" } so scripts/i18n-extract.mjs does not treat them as UI text.
describe("translate", () => {
  const messages = {
    "Merge PDF": "PDF जोड़ें",
    "{count} files": "{count} फ़ाइलें",
    "Empty translation": "",
  };

  it("returns the translation for a known key", () => {
    expect(translate(messages, "Merge PDF")).toBe("PDF जोड़ें");
  });

  it("falls back to the English key when a message is missing or empty", () => {
    expect(translate(messages, "Split PDF")).toBe("Split PDF");
    expect(translate(messages, "Empty translation")).toBe("Empty translation");
    expect(translate({}, "Hello {who}", { who: "Ada" })).toBe("Hello Ada");
  });

  it("fills {vars} in the translated text", () => {
    expect(translate(messages, "{count} files", { count: 3 })).toBe("3 फ़ाइलें");
    expect(translate({}, "{a} and {a} or {b}", { a: "x", b: 0 })).toBe("x and x or 0");
  });

  it("leaves unknown placeholders untouched", () => {
    expect(translate({}, "Hi {who}, {missing}", { who: "Ada" })).toBe("Hi Ada, {missing}");
    expect(translate({}, "Hi {who}")).toBe("Hi {who}");
  });

  it("makeT binds a message table", () => {
    const tr = makeT(messages);
    expect(tr("Merge PDF")).toBe("PDF जोड़ें");
    expect(tr("{count} files", { count: 2 })).toBe("2 फ़ाइलें");
  });
});

describe("loadMessages", () => {
  it("needs no messages for English", async () => {
    expect(await loadMessages("en")).toEqual({});
  });

  it("loads every other locale's message file", async () => {
    const all = await Promise.all(LOCALES.filter((l) => l !== "en").map(async (l) => [l, await loadMessages(l)] as const));
    const sizes = new Set<number>();
    for (const [, messages] of all) {
      expect(Object.keys(messages).length).toBeGreaterThan(100);
      sizes.add(Object.keys(messages).length);
    }
    // Translations are complete, so every locale has the same keys.
    expect(sizes.size).toBe(1);
  });

  it("keeps {placeholders} intact in translations", async () => {
    const hi = await loadMessages("hi");
    const tr = makeT(hi);
    const text = 'No pages match "{spec}". This PDF has {total} pages.';
    expect(hi[text]).toBeTruthy();
    const out = tr(text, { spec: "9-12", total: 4 });
    expect(out).toContain("9-12");
    expect(out).toContain("4");
    expect(out).not.toMatch(/\{\w+\}/);
  });
});
