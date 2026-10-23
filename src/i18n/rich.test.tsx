import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { rich } from "./rich";

/** Flattens rich()'s output into plain strings, rendering tag chunks via their props. */
function flatten(node: ReactNode): string[] {
  if (Array.isArray(node)) return node.flatMap(flatten);
  if (isValidElement(node)) return flatten((node as ReactElement<{ children?: ReactNode }>).props.children);
  return node == null ? [] : [String(node)];
}

describe("rich", () => {
  it("returns plain text unchanged when there are no tags", () => {
    expect(rich("Hello world", {})).toEqual(["Hello world"]);
    expect(rich("", {})).toEqual([]);
  });

  it("renders known tags with their renderer and keeps surrounding text", () => {
    const out = rich("Read our <link>Security</link> page.", { link: (c) => `[${c}]` }) as ReactNode[];
    expect(out).toHaveLength(3);
    expect(out[0]).toBe("Read our ");
    expect(isValidElement(out[1])).toBe(true);
    expect(out[2]).toBe(" page.");
    expect(flatten(out).join("")).toBe("Read our [Security] page.");
  });

  it("handles several tags, including adjacent ones and tags at the edges", () => {
    const tags = { b: (c: string) => c.toUpperCase(), i: (c: string) => `_${c}_` };
    expect(flatten(rich("<b>bold</b><i>it</i> end", tags)).join("")).toBe("BOLD_it_ end");
    expect(flatten(rich("start <i>x</i>", tags)).join("")).toBe("start _x_");
  });

  it("keeps the inner text of unknown tags and ignores unmatched ones", () => {
    expect(flatten(rich("a <x>b</x> c", {})).join("")).toBe("a b c");
    expect(flatten(rich("a <b>b</i> c", { b: (c) => c.toUpperCase() })).join("")).toBe("a <b>b</i> c");
  });

  it("gives each tag fragment a distinct key", () => {
    const out = rich("<b>1</b> <b>2</b>", { b: (c) => c }) as ReactNode[];
    const keys = out.filter(isValidElement).map((e) => e.key);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
  });
});
