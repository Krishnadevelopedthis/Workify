import { describe, expect, it } from "vitest";
import { cleanLine, cleanText, isEmail, normalizeEmail } from "./validation";

describe("isEmail", () => {
  it.each(["a@b.com", "first.last+tag@sub.example.co.in", "x@y.tech", "ü@例え.jp"])("accepts %s", (v) => {
    expect(isEmail(v)).toBe(true);
  });

  it.each([
    "",
    "plain",
    "a@b",
    "a@b.c", // one-letter top-level domain
    "a@.com",
    "a@b..com",
    "@b.com",
    "a b@c.com",
    "a@b c.com",
    "a@@b.com",
    "a@b.com\nBcc: x@y.com", // header injection
    "a\u0000@b.com",
    `${"x".repeat(65)}@b.com`, // local part over 64
    `a@${"b".repeat(250)}.com`, // over 254 in total
  ])("rejects %j", (v) => {
    expect(isEmail(v)).toBe(false);
  });
});

describe("normalizeEmail", () => {
  it("trims, lower-cases and caps the length", () => {
    expect(normalizeEmail("  Ann@Example.COM ")).toBe("ann@example.com");
    expect(normalizeEmail(null)).toBe("");
    expect(normalizeEmail("a".repeat(400))).toHaveLength(254);
  });
});

describe("cleanLine", () => {
  it("turns line breaks and control characters into one space", () => {
    expect(cleanLine("Ann\r\nBcc: x@y.com", 100)).toBe("Ann Bcc: x@y.com");
    expect(cleanLine("A\u0000\u0007B C", 100)).toBe("A B C");
  });
  it("trims and caps the length", () => {
    expect(cleanLine("  Ann  ", 100)).toBe("Ann");
    expect(cleanLine("x".repeat(500), 100)).toHaveLength(100);
    expect(cleanLine(undefined, 10)).toBe("");
  });
});

describe("cleanText", () => {
  it("keeps line breaks and tabs, normalises CRLF, drops other control characters", () => {
    expect(cleanText("a\r\nb\tc\u0000d\u0007", 100)).toBe("a\nb\tcd");
  });
  it("caps the length", () => {
    expect(cleanText("x".repeat(2000), 1000)).toHaveLength(1000);
  });
});
