import { describe, expect, it } from "vitest";
import { baseHeaders, url } from "./helpers";

describe("GET /api/health", () => {
  it("reports ok with the database up and is never cached", async () => {
    const res = await fetch(url("/api/health"), { headers: baseHeaders() });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toEqual({ status: "ok", database: true });
  });

  it("?engines=1 lists every PDF engine as a boolean", async () => {
    const res = await fetch(url("/api/health?engines=1"), { headers: baseHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body.engines).sort()).toEqual(["ghostscript", "libreoffice", "python", "qpdf", "tesseract"]);
    for (const v of Object.values(body.engines)) expect(typeof v).toBe("boolean");
  });

  it("does not reveal engine paths or versions", async () => {
    const text = await (await fetch(url("/api/health?engines=1"), { headers: baseHeaders() })).text();
    expect(text).not.toMatch(/[\\/]|\d+\.\d+\.\d+/);
  });

  it("rejects other methods", async () => {
    const res = await fetch(url("/api/health"), { method: "POST", headers: baseHeaders() });
    expect(res.status).toBe(405);
  });
});
