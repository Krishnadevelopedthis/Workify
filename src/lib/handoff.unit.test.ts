import { beforeEach, describe, expect, it } from "vitest";
import { clearHandOff, handOff, peekHandOff } from "./handoff";

describe("handoff", () => {
  beforeEach(() => clearHandOff());

  it("starts empty", () => {
    expect(peekHandOff()).toBeNull();
  });

  it("hands over the files and can be read several times without clearing", () => {
    const files = [new File(["a"], "a.pdf"), new File(["b"], "b.pdf")];
    handOff(files);
    expect(peekHandOff()).toBe(files);
    expect(peekHandOff()).toBe(files); // a React state initializer may run twice
  });

  it("replaces earlier files with the latest hand-off", () => {
    const first = [new File(["1"], "1.pdf")];
    const second = [new File(["2"], "2.pdf")];
    handOff(first);
    handOff(second);
    expect(peekHandOff()).toBe(second);
  });

  it("clears", () => {
    handOff([new File(["x"], "x.pdf")]);
    clearHandOff();
    expect(peekHandOff()).toBeNull();
    clearHandOff(); // clearing twice is harmless
    expect(peekHandOff()).toBeNull();
  });

  it("keeps an empty list distinct from nothing", () => {
    handOff([]);
    expect(peekHandOff()).toEqual([]);
  });
});
