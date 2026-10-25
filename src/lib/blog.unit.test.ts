import { describe, expect, it } from "vitest";
import { POSTS } from "./blog";
import { TOOLS } from "./tools";

// Posts become static routes (/[lang]/blog/[slug]) and sitemap entries, so a
// bad slug or date breaks the build or the sitemap.

describe("blog posts", () => {
  it("have unique, URL-safe slugs", () => {
    const slugs = POSTS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("do not clash with tool slugs", () => {
    const tools = new Set(TOOLS.map((t) => t.slug));
    for (const p of POSTS) expect(tools.has(p.slug)).toBe(false);
  });

  it("have real ISO dates (YYYY-MM-DD) that round-trip", () => {
    for (const p of POSTS) {
      expect(p.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(`${p.date}T00:00:00Z`).toISOString().slice(0, 10)).toBe(p.date);
    }
  });

  it("have a title, an excerpt and at least one non-empty paragraph", () => {
    for (const p of POSTS) {
      expect(p.title.trim()).not.toBe("");
      expect(p.excerpt.trim()).not.toBe("");
      expect(p.body.length).toBeGreaterThan(0);
      for (const para of p.body) expect(para.trim()).not.toBe("");
    }
  });

  it("keep titles and excerpts short enough for search results", () => {
    for (const p of POSTS) {
      expect(p.title.length).toBeLessThanOrEqual(70);
      expect(p.excerpt.length).toBeLessThanOrEqual(160);
    }
  });
});
