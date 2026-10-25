// Developer API (/api/v1): authentication errors. Every route must refuse a
// missing, malformed, unknown or wrongly-schemed key with the documented JSON
// shape { error: { status, message } } and never run work for it.
import { describe, expect, it } from "vitest";
import { baseHeaders, expectNoLeak, makePdf, url } from "./helpers";

type ApiErr = { error: { status: number; message: string } };

async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(url(path), { ...init, headers: { ...baseHeaders(), ...(init.headers as Record<string, string>) } });
  const text = await res.text();
  return { res, text, body: JSON.parse(text) as ApiErr };
}

function expectApiError(r: { res: Response; text: string; body: ApiErr }, status: number, match?: string) {
  expect(r.res.status, r.text).toBe(status);
  expect(r.res.headers.get("content-type")).toMatch(/application\/json/);
  expect(r.res.headers.get("cache-control")).toBe("no-store");
  expect(r.body.error.status).toBe(status);
  expect(typeof r.body.error.message).toBe("string");
  expectNoLeak(r.body.error.message);
  if (match) expect(r.body.error.message).toContain(match);
}

const MISSING = "Send your API key as: Authorization: Bearer wfy_...";
const INVALID = "This API key is invalid or has been revoked.";
const unknownKey = () => `wfy_${Array.from({ length: 40 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join("")}`;

const GET_ROUTES = ["/api/v1/me", "/api/v1/tools", "/api/v1/tasks/some-task-id", "/api/v1/signatures", "/api/v1/signatures/some-id", "/api/v1/signatures/some-id/file"];

describe("developer API authentication", () => {
  for (const path of GET_ROUTES) {
    it(`GET ${path} without a key -> 401`, async () => {
      expectApiError(await call(path), 401, MISSING);
    });
    it(`GET ${path} with an unknown key -> 401`, async () => {
      expectApiError(await call(path, { headers: { authorization: `Bearer ${unknownKey()}` } }), 401, INVALID);
    });
  }

  it("malformed Authorization headers -> 401 asking for a Bearer key", async () => {
    const key = unknownKey();
    for (const header of [
      key, // no scheme
      `Basic ${Buffer.from(`user:${key}`).toString("base64")}`,
      `Bearer ${key.slice(4)}`, // no wfy_ prefix
      "Bearer wfy_short",
      `Bearer ${key}' OR '1'='1`,
      `Bearer ${key} extra`,
      `Bearer wfy_${"a".repeat(81)}`, // too long
      "Bearer ",
    ]) {
      expectApiError(await call("/api/v1/me", { headers: { authorization: header } }), 401, MISSING);
    }
  });

  it("the key is not accepted from the query string or a cookie", async () => {
    const key = unknownKey();
    expectApiError(await call(`/api/v1/me?api_key=${key}`), 401, MISSING);
    expectApiError(await call("/api/v1/me", { headers: { cookie: `api_key=${key}` } }), 401, MISSING);
  });

  it("POST /api/v1/tools/{tool} is refused before the upload is processed", async () => {
    const fd = new FormData();
    const pdf = await makePdf(1);
    fd.append("files", new Blob([pdf as BlobPart], { type: "application/pdf" }), "a.pdf");
    fd.append("files", new Blob([pdf as BlobPart], { type: "application/pdf" }), "b.pdf");
    expectApiError(await call("/api/v1/tools/merge-pdf", { method: "POST", body: fd }), 401, MISSING);
    expectApiError(await call("/api/v1/tools/merge-pdf", { method: "POST", body: fd, headers: { authorization: `Bearer ${unknownKey()}` } }), 401, INVALID);
    // Unknown tools are not revealed before authentication either.
    expectApiError(await call("/api/v1/tools/no-such-tool", { method: "POST", body: fd }), 401, MISSING);
  });

  it("POST /api/v1/signatures is refused without a key", async () => {
    const fd = new FormData();
    fd.append("signers", JSON.stringify([{ name: "A" }]));
    expectApiError(await call("/api/v1/signatures", { method: "POST", body: fd }), 401, MISSING);
  });

  it("repeated bad keys stay 401 (no 500, no information about key existence)", async () => {
    const messages = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const r = await call("/api/v1/me", { headers: { authorization: `Bearer ${unknownKey()}` } });
      expect(r.res.status).toBe(401);
      messages.add(r.body.error.message);
    }
    expect([...messages]).toEqual([INVALID]);
  });
});
