import { describe, expect, it } from "vitest";
import { fromRanges, toRanges } from "./PagesEditor";

describe("toRanges", () => {
  it("collapses consecutive pages into ranges", () => {
    expect(toRanges([1, 2, 3, 5])).toBe("1-3, 5");
    expect(toRanges([7])).toBe("7");
    expect(toRanges([1, 2, 4, 5, 9])).toBe("1-2, 4-5, 9");
    expect(toRanges([])).toBe("");
  });

  it("sorts and removes duplicates first", () => {
    expect(toRanges([5, 3, 1, 2, 3, 2])).toBe("1-3, 5");
  });
});

describe("fromRanges", () => {
  it("parses pages and ranges", () => {
    expect(fromRanges("1-3, 5", 10)).toEqual(new Set([1, 2, 3, 5]));
    expect(fromRanges(" 2 - 4 ,", 10)).toEqual(new Set([2, 3, 4]));
    expect(fromRanges("", 10)).toEqual(new Set());
  });

  it("accepts reversed ranges", () => {
    expect(fromRanges("4-2", 10)).toEqual(new Set([2, 3, 4]));
  });

  it("ignores pages outside 1..total", () => {
    expect(fromRanges("0-2, 9-20", 10)).toEqual(new Set([1, 2, 9, 10]));
    expect(fromRanges("15", 10)).toEqual(new Set());
  });

  it("returns null for text that is not a list of ranges", () => {
    for (const text of ["abc", "1-", "-3", "1-2-3", "1;2", "1.5"]) expect(fromRanges(text, 10)).toBeNull();
  });

  it("round-trips with toRanges", () => {
    const pages = [1, 2, 3, 6, 8, 9, 10];
    expect([...fromRanges(toRanges(pages), 10)!].sort((a, b) => a - b)).toEqual(pages);
  });
});
