import { describe, expect, it } from "vitest";
import { TOOLS, type Tool, type ToolOption } from "@/lib/tools";
import { localizeOption, localizeTool } from "./tools";
import { loadMessages, makeT, type T } from "./translate";

// localizeTool must translate only what people read. Slugs, option keys,
// values and defaults are sent to the processing API and must stay English.

const mark: T = (s) => `«${s}»`;
const snapshot = () => JSON.stringify(TOOLS);

describe("localizeOption", () => {
  it("translates labels and choice labels/hints but keeps keys, values and defaults", () => {
    const o: ToolOption = {
      type: "choice",
      key: "level",
      label: "Compression level",
      default: "recommended",
      choices: [
        { value: "extreme", label: "Extreme", hint: "Smallest file" },
        { value: "recommended", label: "Recommended" },
      ],
    };
    const out = localizeOption(o, mark);
    expect(out).toMatchObject({ type: "choice", key: "level", label: "«Compression level»", default: "recommended" });
    if (out.type !== "choice") throw new Error("type changed");
    expect(out.choices).toEqual([
      { value: "extreme", label: "«Extreme»", hint: "«Smallest file»" },
      { value: "recommended", label: "«Recommended»" },
    ]);
  });

  it("does not add an empty hint to choices without one", () => {
    const out = localizeOption(
      { type: "choice", key: "k", label: "L", default: "a", choices: [{ value: "a", label: "A", hint: "" }] },
      mark,
    );
    if (out.type !== "choice") throw new Error("type changed");
    expect(out.choices[0]).toEqual({ value: "a", label: "«A»", hint: "" });
  });

  it("keeps placeholders without letters (page ranges, numbers) untranslated", () => {
    const out = localizeOption({ type: "text", key: "pages", label: "Pages", default: "", placeholder: "1, 3-5" }, mark);
    expect(out).toMatchObject({ label: "«Pages»", placeholder: "1, 3-5" });
    const multi = localizeOption(
      { type: "multi", key: "lang", label: "Language", default: "eng", max: 3, choices: [{ value: "x", label: "123" }] },
      mark,
    );
    if (multi.type !== "multi") throw new Error("type changed");
    expect(multi.choices[0].label).toBe("123");
  });

  it("translates placeholders with words and hints of text and password options", () => {
    const text = localizeOption({ type: "text", key: "t", label: "Text", default: "Workify", placeholder: "Your name", hint: "Shown on every page" }, mark);
    expect(text).toMatchObject({ default: "Workify", placeholder: "«Your name»", hint: "«Shown on every page»" });
    const pw = localizeOption({ type: "password", key: "p", label: "Password", default: "", placeholder: "Secret" }, mark);
    expect(pw).toMatchObject({ label: "«Password»", placeholder: "«Secret»" });
    expect(pw).not.toHaveProperty("hint");
  });

  it("leaves empty placeholders and hints as they are", () => {
    const out = localizeOption({ type: "text", key: "t", label: "T", default: "", placeholder: "", hint: "" }, mark);
    expect(out).toMatchObject({ placeholder: "", hint: "" });
  });

  it("only translates the label of other option types", () => {
    const opts: ToolOption[] = [
      { type: "number", key: "n", label: "Size", default: 12, min: 1, max: 99 },
      { type: "checkbox", key: "c", label: "Bold", default: true },
      { type: "color", key: "col", label: "Color", default: "#e5322d" },
      { type: "position", key: "pos", label: "Position", default: "mc" },
      { type: "file", key: "f", label: "Image", accept: ".png" },
    ];
    for (const o of opts) expect(localizeOption(o, mark)).toEqual({ ...o, label: `«${o.label}»` });
  });

  it("never changes the option it was given", () => {
    const o: ToolOption = { type: "choice", key: "k", label: "L", default: "a", choices: [{ value: "a", label: "A", hint: "H" }] };
    const before = JSON.stringify(o);
    localizeOption(o, mark);
    expect(JSON.stringify(o)).toBe(before);
  });
});

describe("localizeTool", () => {
  it("keeps every slug, option key, value and default for every tool", () => {
    for (const tool of TOOLS) {
      const out = localizeTool(tool, mark);
      expect(out.slug).toBe(tool.slug);
      expect(out.name).toBe(`«${tool.name}»`);
      expect(out.action).toBe(`«${tool.action}»`);
      expect(out.options?.length).toBe(tool.options?.length);
      out.options?.forEach((o, i) => {
        const src = tool.options![i];
        expect(o.type).toBe(src.type);
        expect(o.key).toBe(src.key);
        if ("default" in src) expect((o as { default: unknown }).default).toEqual(src.default);
        if ("choices" in src && "choices" in o) expect(o.choices.map((c) => c.value)).toEqual(src.choices.map((c) => c.value));
      });
    }
  });

  it("keeps optional texts absent when the tool has none", () => {
    const bare = { ...TOOLS[0], acceptLabel: undefined, unavailable: undefined, options: undefined } as unknown as Tool;
    const out = localizeTool(bare, mark);
    expect(out.acceptLabel).toBeUndefined();
    expect(out.unavailable).toBeUndefined();
    expect(out.options).toBeUndefined();
  });

  it("does not modify the shared tool catalogue", () => {
    const before = snapshot();
    for (const tool of TOOLS) localizeTool(tool, mark);
    expect(snapshot()).toBe(before);
  });

  it("is the identity for English", () => {
    const en = makeT({});
    for (const tool of TOOLS) expect(JSON.stringify(localizeTool(tool, en))).toBe(JSON.stringify(tool));
  });

  it("works with a real message file and never yields empty texts", async () => {
    const t = makeT(await loadMessages("de"));
    for (const tool of TOOLS) {
      const out = localizeTool(tool, t);
      for (const s of [out.name, out.title, out.subtitle, out.description, out.action]) expect(s.trim()).not.toBe("");
      for (const o of out.options ?? []) expect(o.label.trim()).not.toBe("");
    }
  });
});
