import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { signerOverlays, stampSignerOverlays, withRequestLock } from "./signing";

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("withRequestLock", () => {
  it("runs calls for one request one after another", async () => {
    const log: string[] = [];
    const job = (name: string, ms: number) => async () => {
      log.push(`${name} start`);
      await tick(ms);
      log.push(`${name} end`);
      return name;
    };
    const results = await Promise.all([withRequestLock("r1", job("a", 20)), withRequestLock("r1", job("b", 1))]);
    expect(results).toEqual(["a", "b"]);
    expect(log).toEqual(["a start", "a end", "b start", "b end"]);
  });

  it("lets other requests run in parallel and survives a failing call", async () => {
    const log: string[] = [];
    const slow = withRequestLock("r2", async () => {
      await tick(20);
      log.push("r2");
    });
    await withRequestLock("r3", async () => log.push("r3"));
    await slow;
    expect(log).toEqual(["r3", "r2"]);

    await expect(withRequestLock("r4", async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(withRequestLock("r4", async () => "next")).resolves.toBe("next");
  });
});

describe("signerOverlays", () => {
  it("refuses shapes, lines, drawings and unknown images", () => {
    for (const kind of ["rect", "ellipse", "line", "path", "whatever"]) {
      expect(signerOverlays([{ kind, page: 1, x: 40, y: 690, w: 300, h: 40, fill: "#ffffff" }])).toBeNull();
    }
    expect(signerOverlays([{ kind: "image", page: 1, x: 0, y: 0, w: 10, h: 10, image: "other" }])).toBeNull();
    expect(signerOverlays([null])).toBeNull();
    expect(signerOverlays("[]")).toBeNull();
  });

  it("keeps signatures and text, capped in size", () => {
    const out = signerOverlays([
      { kind: "image", page: 1, x: 10, y: 20, w: 3000, h: 1000, image: "signature" },
      { kind: "text", page: 2, x: 5, y: 6, text: "a\nb\r\nc", size: 400, color: "#1b1b1f", font: "Helvetica" },
    ]);
    expect(out).toEqual([
      { kind: "image", page: 1, x: 10, y: 20, w: 300, h: 100, image: "signature" },
      { kind: "text", page: 2, x: 5, y: 6, text: "a b c", size: 24, color: "#1b1b1f", font: "Helvetica", bold: false },
    ]);
  });
});

describe("stampSignerOverlays", () => {
  it("draws the marks with the Multiply blend mode on the right page only", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    doc.addPage([200, 200]);
    const overlays = signerOverlays([{ kind: "text", page: 2, x: 10, y: 10, text: "Signed", size: 14, color: "#1b1b1f", font: "Helvetica" }])!;
    await stampSignerOverlays({ extras: {} }, doc, overlays);
    const saved = await PDFDocument.load(await doc.save());
    const xobjects = (n: number) => saved.getPage(n).node.Resources()?.lookupMaybe(PDFName.of("XObject"), PDFDict)?.keys().length ?? 0;
    expect(xobjects(0)).toBe(0);
    expect(xobjects(1)).toBe(1);
    const states = saved.getPage(1).node.Resources()!.lookup(PDFName.of("ExtGState"), PDFDict);
    const gs = states.lookup(states.keys()[0], PDFDict);
    expect(gs.get(PDFName.of("BM"))).toEqual(PDFName.of("Multiply"));
  });
});
