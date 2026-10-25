import { describe, expect, it } from "vitest";
import { localePath } from "@/i18n/config";
import { overLimit, record, safeNext, unrecord } from "./auth-guards";

describe("safeNext", () => {
  it("keeps paths on this site and drops the locale prefix", () => {
    expect(safeNext("/account")).toBe("/account");
    expect(safeNext("/hi/account?tab=1#x")).toBe("/account?tab=1#x");
    expect(safeNext("/hi")).toBe("/");
    expect(safeNext(null)).toBe("/");
  });

  it("refuses anything that could leave the site", () => {
    const evil = [
      "//evil.com",
      "/\\evil.com",
      "https://evil.com",
      "evil.com",
      "/hi//evil.com",
      "/hi/\\evil.com",
      "/.//evil.com",
      "/x/..//evil.com",
      "/hi/.//evil.com",
      "/\t/evil.com",
      "/hi/\t/evil.com",
    ];
    for (const next of evil) {
      const out = safeNext(next);
      expect(out.startsWith("/") && !out.startsWith("//") && !out.includes("\\")).toBe(true);
      for (const lang of ["en", "hi"] as const) {
        expect(new URL(localePath(lang, out), "https://workify.example").origin).toBe("https://workify.example");
      }
    }
  });
});

describe("auth counters", () => {
  it("counts recorded events in the window and can take one back", () => {
    const key = `test:${Math.random()}`;
    expect(overLimit(key, 2, 60_000)).toBe(false);
    record(key);
    record(key);
    expect(overLimit(key, 2, 60_000)).toBe(true);
    unrecord(key);
    expect(overLimit(key, 2, 60_000)).toBe(false);
    expect(overLimit(key, 1, 60_000)).toBe(true);
  });

  it("keeps keys independent", () => {
    const a = `test:a:${Math.random()}`;
    const b = `test:b:${Math.random()}`;
    record(a);
    expect(overLimit(a, 1, 60_000)).toBe(true);
    expect(overLimit(b, 1, 60_000)).toBe(false);
  });
});
