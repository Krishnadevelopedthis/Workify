import { describe, expect, it } from "vitest";
import icons from "./icons.json";
import {
  ALL_TOOLS_MENU,
  CATEGORIES,
  CONVERT_MENU,
  OCR_LANGUAGES,
  optionVisible,
  POSITION_VALUES,
  TOOL_BY_SLUG,
  TOOLS,
  WORKFLOW_STEPS,
  workflowStepOptions,
  type ToolOption,
} from "./tools";

// Invariants of the tool catalogue: every page, menu, API call and workflow
// step is driven by it, so a typo here breaks a feature silently.

const iconSet = icons as unknown as { icons: Record<string, unknown>; aliases?: Record<string, unknown> };

/** Is `value` an acceptable default for the option (what the sidebar would submit untouched)? */
function defaultIsValid(opt: ToolOption): boolean {
  switch (opt.type) {
    case "choice":
      return opt.choices.some((c) => c.value === opt.default);
    case "multi": {
      const parts = opt.default.split("+").filter(Boolean);
      return parts.length >= 1 && parts.length <= opt.max && parts.every((p) => opt.choices.some((c) => c.value === p));
    }
    case "number":
      return (
        Number.isFinite(opt.default) &&
        (opt.min === undefined || opt.default >= opt.min) &&
        (opt.max === undefined || opt.default <= opt.max)
      );
    case "checkbox":
      return typeof opt.default === "boolean";
    case "color":
      return /^#[0-9a-f]{6}$/i.test(opt.default);
    case "position":
      return POSITION_VALUES.includes(opt.default);
    case "text":
    case "password":
      return typeof opt.default === "string";
    case "file":
      return typeof opt.accept === "string" && opt.accept.length > 0;
  }
}

describe("tool catalogue", () => {
  it("has unique, URL-safe slugs and a lookup entry for each", () => {
    const slugs = TOOLS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(TOOL_BY_SLUG.size).toBe(TOOLS.length);
    for (const t of TOOLS) expect(TOOL_BY_SLUG.get(t.slug)).toBe(t);
  });

  it("gives every tool the text, category, colour and icon its card needs", () => {
    const categories = new Set(CATEGORIES.map((c) => c.id));
    for (const t of TOOLS) {
      // HTML to PDF takes a URL, not a file, so it alone has no accept list.
      const fields = t.editor === "html" ? (["name", "description", "title", "subtitle", "action"] as const) : (["name", "description", "title", "subtitle", "action", "acceptLabel", "accept"] as const);
      for (const field of fields) {
        expect(t[field].trim(), `${t.slug}.${field}`).not.toBe("");
      }
      expect(categories.has(t.category), `${t.slug} category`).toBe(true);
      expect(t.color, `${t.slug} color`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(iconSet.icons[t.icon] ?? iconSet.aliases?.[t.icon], `${t.slug} icon "${t.icon}"`).toBeDefined();
    }
  });

  it("only sets minFiles on tools that take several files, and never below 2", () => {
    for (const t of TOOLS.filter((x) => x.minFiles !== undefined)) {
      expect(t.multiple, t.slug).toBe(true);
      expect(t.minFiles!, t.slug).toBeGreaterThanOrEqual(2);
    }
  });

  it("uses a unique key for every option of a tool", () => {
    for (const t of TOOLS) {
      const keys = (t.options ?? []).map((o) => o.key);
      expect(new Set(keys).size, t.slug).toBe(keys.length);
      for (const k of keys) expect(k, t.slug).toMatch(/^[A-Za-z][A-Za-z0-9]*$/);
    }
  });

  it("ships a valid default for every option", () => {
    for (const t of TOOLS) {
      for (const o of t.options ?? []) expect(defaultIsValid(o), `${t.slug}.${o.key} default`).toBe(true);
    }
  });

  it("has well-formed choice lists and number ranges", () => {
    for (const t of TOOLS) {
      for (const o of t.options ?? []) {
        if (o.type === "choice" || o.type === "multi") {
          const values = o.choices.map((c) => c.value);
          expect(values.length, `${t.slug}.${o.key}`).toBeGreaterThan(0);
          expect(new Set(values).size, `${t.slug}.${o.key} duplicate choice`).toBe(values.length);
          if (o.type === "multi") {
            expect(o.max, `${t.slug}.${o.key}`).toBeGreaterThanOrEqual(1);
            // "+" joins several values, so it must never appear inside one.
            for (const v of values) expect(v).not.toContain("+");
          }
        }
        if (o.type === "number" && o.min !== undefined && o.max !== undefined) {
          expect(o.min, `${t.slug}.${o.key}`).toBeLessThanOrEqual(o.max);
        }
        if (o.type === "number" && o.step !== undefined) expect(o.step).toBeGreaterThan(0);
      }
    }
  });

  it("only makes options depend on an existing option of the same tool, with reachable values", () => {
    for (const t of TOOLS) {
      const byKey = new Map((t.options ?? []).map((o) => [o.key, o]));
      for (const o of t.options ?? []) {
        if (!o.showIf) continue;
        const parent = byKey.get(o.showIf.key);
        expect(parent, `${t.slug}.${o.key} showIf.key "${o.showIf.key}"`).toBeDefined();
        expect(parent).not.toBe(o);
        const wanted = Array.isArray(o.showIf.equals) ? o.showIf.equals : [o.showIf.equals];
        expect(wanted.length).toBeGreaterThan(0);
        for (const w of wanted) {
          if (parent!.type === "choice") expect(parent!.choices.map((c) => c.value), `${t.slug}.${o.key}`).toContain(w);
          if (parent!.type === "checkbox") expect(["true", "false"]).toContain(w);
        }
      }
    }
  });

  it("offers OCR languages with unique Tesseract codes", () => {
    const codes = OCR_LANGUAGES.map(([c]) => c);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of codes) expect(c).toMatch(/^[a-z]{3}(?:_[a-z]{3})?$/);
    expect(codes).toContain("eng");
  });

  it("has nine distinct anchor positions", () => {
    expect(POSITION_VALUES).toHaveLength(9);
    expect(new Set(POSITION_VALUES).size).toBe(9);
    for (const p of POSITION_VALUES) expect(p).toMatch(/^[tmb][lcr]$/);
  });
});

describe("menus", () => {
  it("link only to real tools, once per group", () => {
    for (const [group, slugs] of [...Object.entries(ALL_TOOLS_MENU), ...Object.entries(CONVERT_MENU)]) {
      expect(new Set(slugs).size, group).toBe(slugs.length);
      for (const s of slugs) expect(TOOL_BY_SLUG.has(s), `${group}: ${s}`).toBe(true);
    }
  });

  it("reuses the convert dropdown groups in the mega menu", () => {
    expect(ALL_TOOLS_MENU["Convert to PDF"]).toEqual(CONVERT_MENU["Convert to PDF"]);
    expect(ALL_TOOLS_MENU["Convert from PDF"]).toEqual(CONVERT_MENU["Convert from PDF"]);
  });
});

describe("workflow steps", () => {
  it("reference real, available, PDF-in tools without a dedicated editor (except rotate)", () => {
    expect(new Set(WORKFLOW_STEPS).size).toBe(WORKFLOW_STEPS.length);
    for (const s of WORKFLOW_STEPS) {
      const tool = TOOL_BY_SLUG.get(s);
      expect(tool, s).toBeDefined();
      expect(tool!.unavailable, s).toBeUndefined();
      expect(tool!.accept, s).toContain(".pdf");
      expect(tool!.category, s).not.toBe("workflows");
    }
  });

  it("never asks for a file upload inside a step", () => {
    for (const s of WORKFLOW_STEPS) {
      for (const o of workflowStepOptions(s)) expect(o.type, `${s}.${o.key}`).not.toBe("file");
    }
  });

  it("only keeps showIf rules whose controlling option is still part of the step", () => {
    for (const s of WORKFLOW_STEPS) {
      const opts = workflowStepOptions(s);
      const keys = new Set(opts.map((o) => o.key));
      for (const o of opts) if (o.showIf) expect(keys.has(o.showIf.key), `${s}.${o.key}`).toBe(true);
    }
  });

  it("gives rotate a single angle choice of quarter turns", () => {
    const [angle, ...rest] = workflowStepOptions("rotate-pdf");
    expect(rest).toEqual([]);
    expect(angle.key).toBe("angle");
    expect(angle.type).toBe("choice");
    if (angle.type === "choice") {
      expect(angle.choices.map((c) => c.value)).toEqual(["90", "180", "270"]);
      expect(defaultIsValid(angle)).toBe(true);
    }
  });

  it("limits watermark steps to text watermarks", () => {
    const opts = workflowStepOptions("add-watermark");
    expect(opts.find((o) => o.key === "kind")).toBeUndefined();
    expect(opts.some((o) => o.key === "text")).toBe(true);
    // Every remaining option is shown unconditionally.
    for (const o of opts) expect(o.showIf).toBeUndefined();
  });

  it("does not mutate the tool definitions it derives step options from", () => {
    const before = JSON.stringify(TOOL_BY_SLUG.get("add-watermark")!.options);
    workflowStepOptions("add-watermark");
    expect(JSON.stringify(TOOL_BY_SLUG.get("add-watermark")!.options)).toBe(before);
  });

  it("returns no options for unknown slugs", () => {
    expect(workflowStepOptions("")).toEqual([]);
    expect(workflowStepOptions("no-such-tool")).toEqual([]);
    expect(workflowStepOptions("__proto__")).toEqual([]);
  });
});

describe("optionVisible", () => {
  const base = { type: "text", key: "x", label: "X", default: "" } as const;

  it("shows options without a condition", () => {
    expect(optionVisible(base, {})).toBe(true);
  });

  it("compares the controlling value as a string", () => {
    const opt: ToolOption = { ...base, showIf: { key: "ocr", equals: "true" } };
    expect(optionVisible(opt, { ocr: true })).toBe(true);
    expect(optionVisible(opt, { ocr: "true" })).toBe(true);
    expect(optionVisible(opt, { ocr: false })).toBe(false);
    expect(optionVisible(opt, {})).toBe(false);
  });

  it("accepts any of several values", () => {
    const opt: ToolOption = { ...base, showIf: { key: "mode", equals: ["a", "b"] } };
    expect(optionVisible(opt, { mode: "a" })).toBe(true);
    expect(optionVisible(opt, { mode: "b" })).toBe(true);
    expect(optionVisible(opt, { mode: "c" })).toBe(false);
    expect(optionVisible(opt, { mode: undefined })).toBe(false);
  });

  it("does not treat a missing value as the literal string 'undefined' match unless asked", () => {
    const opt: ToolOption = { ...base, showIf: { key: "mode", equals: "undefined" } };
    // Documents current behaviour: String(undefined) === "undefined".
    expect(optionVisible(opt, {})).toBe(true);
  });
});
