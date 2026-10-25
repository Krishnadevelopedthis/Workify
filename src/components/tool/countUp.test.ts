import { describe, expect, it } from "vitest";
import { countUpValue } from "./countUp";

describe("countUpValue", () => {
  it("starts at 0", () => {
    expect(countUpValue(73, 0, 900)).toBe(0);
  });

  it("reaches the target at the duration and stays there", () => {
    expect(countUpValue(73, 900, 900)).toBe(73);
    expect(countUpValue(73, 5000, 900)).toBe(73);
  });

  it("never overshoots and never decreases", () => {
    for (const target of [1, 7, 42, 99, 100]) {
      let prev = 0;
      for (let ms = 0; ms <= 1000; ms += 5) {
        const v = countUpValue(target, ms, 900);
        expect(v).toBeLessThanOrEqual(target);
        expect(v).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
    }
  });

  it("handles a zero duration and a zero target", () => {
    expect(countUpValue(50, 0, 0)).toBe(50);
    expect(countUpValue(0, 300, 900)).toBe(0);
  });
});
