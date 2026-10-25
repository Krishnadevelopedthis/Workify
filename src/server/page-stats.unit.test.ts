import { describe, expect, it } from "vitest";
import { knownPath, referrerHost } from "./page-stats";

describe("knownPath", () => {
  it("keeps the site's own pages", () => {
    expect(knownPath("/")).toBe("/");
    expect(knownPath("/tools")).toBe("/tools");
    expect(knownPath("/pricing")).toBe("/pricing");
  });

  it("keeps tool pages", () => {
    expect(knownPath("/merge-pdf")).toBe("/merge-pdf");
    expect(knownPath("/compress-pdf")).toBe("/compress-pdf");
  });

  it("strips the language prefix, so a page counts once in every language", () => {
    expect(knownPath("/hi/merge-pdf")).toBe("/merge-pdf");
    expect(knownPath("/ar/pricing")).toBe("/pricing");
    expect(knownPath("/ja")).toBe("/");
  });

  it("groups pages that carry an id, so nothing personal is stored", () => {
    expect(knownPath("/blog/how-to-merge-pdf-files")).toBe("/blog/*");
    expect(knownPath("/account/signatures/7")).toBe("/account");
    expect(knownPath("/sign/sometoken")).toBe("/sign");
  });

  it("drops anything the app does not serve", () => {
    expect(knownPath("/not-a-page")).toBeNull();
    expect(knownPath("/wp-admin")).toBeNull();
    expect(knownPath("/search?q=my+private+text")).toBeNull();
  });

  it("ignores a trailing slash", () => {
    expect(knownPath("/tools/")).toBe("/tools");
    expect(knownPath("/")).toBe("/");
  });
});

describe("referrerHost", () => {
  it("keeps the bare host of another site", () => {
    expect(referrerHost("https://www.google.com/search?q=merge+pdf", "workify.example")).toBe("google.com");
    expect(referrerHost("https://t.co/abc", "workify.example")).toBe("t.co");
  });

  it("drops the path and query, which could hold private text", () => {
    expect(referrerHost("https://mail.example.com/inbox/secret-id", "workify.example")).toBe("mail.example.com");
  });

  it("treats our own site as a direct visit", () => {
    expect(referrerHost("https://workify.example/tools", "workify.example")).toBe("");
    expect(referrerHost("https://www.workify.example/tools", "workify.example")).toBe("");
  });

  it("returns nothing for an empty or broken referrer", () => {
    expect(referrerHost("", "workify.example")).toBe("");
    expect(referrerHost("not a url", "workify.example")).toBe("");
  });
});
