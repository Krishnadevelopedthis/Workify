import { beforeEach, describe, expect, it, vi } from "vitest";

const createRequest = vi.fn();
let userId = 1;

vi.mock("@/server/api", async () => {
  class ApiError extends Error {
    constructor(
      readonly status: number,
      message: string,
    ) {
      super(message);
    }
  }
  return {
    ApiError,
    apiError: (status: number, message: string) => Response.json({ error: { status, message } }, { status }),
    authenticate: () => ({ id: userId, name: "Owner", verified: true }),
  };
});
vi.mock("@/server/run-task", () => ({ TaskError: class extends Error {} }));
vi.mock("@/server/monitor", () => ({ logError: vi.fn() }));
vi.mock("@/server/sign-http", () => ({ clientOf: () => ({ ip: null, userAgent: null }) }));
vi.mock("@/server/sign-input", () => ({
  SignInputError: class extends Error {},
  validateSignInput: async () => ({ signers: [{ name: "A", email: "a@example.com" }] }),
}));
vi.mock("@/server/sign-requests", () => ({ createRequest, requestsForUser: () => [] }));
vi.mock("./shared", () => ({ requestJson: () => ({}) }));

const post = (ip: string) => {
  const form = new FormData();
  form.set("signers", "[]");
  return new Request("http://localhost/api/v1/signatures", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
    body: form,
  });
};

beforeEach(() => {
  vi.resetModules();
  delete (globalThis as { workifyLimits?: unknown }).workifyLimits;
  createRequest.mockReset().mockResolvedValue({ id: "r1", signers: [] });
});

describe("POST /api/v1/signatures", () => {
  it("applies the signRequest limit per account, even across IPs", async () => {
    const { POST } = await import("./route");
    const { LIMITS } = await import("@/server/rate-limit");
    const perUser = Math.ceil(LIMITS.signRequest.perClient / 2);
    for (let i = 0; i < perUser; i++) expect((await POST(post(`198.51.100.${i + 1}`))).status).toBe(201);
    const refused = await POST(post("203.0.113.9"));
    expect(refused.status).toBe(429);
    expect(createRequest).toHaveBeenCalledTimes(perUser);
    userId = 2;
    expect((await POST(post("203.0.113.9"))).status).toBe(201);
  });

  it("applies the signRequest limit per IP across accounts", async () => {
    const { POST } = await import("./route");
    const { LIMITS } = await import("@/server/rate-limit");
    for (let i = 0; i < LIMITS.signRequest.perClient; i++) {
      userId = 100 + i;
      expect((await POST(post("192.0.2.50"))).status).toBe(201);
    }
    userId = 999;
    expect((await POST(post("192.0.2.50"))).status).toBe(429);
  });
});
