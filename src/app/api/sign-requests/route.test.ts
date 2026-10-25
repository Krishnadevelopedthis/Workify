import { beforeEach, describe, expect, it, vi } from "vitest";

const createRequest = vi.fn();
const validateSignInput = vi.fn();
let user: { id: number; name: string; verified: boolean } | null = null;

vi.mock("@/i18n/request", () => ({
  requestT: async () => ({ t: (s: string) => s, lang: "en" }),
}));
vi.mock("@/server/auth", () => ({ currentUser: async () => user }));
vi.mock("@/server/sign-input", () => ({ SignInputError: class extends Error {}, validateSignInput }));
vi.mock("@/server/sign-requests", () => ({
  ANON_MAX_BYTES: 20 * 1024 * 1024,
  AnonymousLimitError: class extends Error {
    constructor(readonly kind: string) {
      super(kind);
    }
  },
  createRequest,
  manageLink: (t: string) => `/sign/manage/${t}`,
}));

const MB = 1024 * 1024;
const post = (bytes: number, headers: Record<string, string> = {}) => {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(bytes)], "a.pdf", { type: "application/pdf" }));
  form.set("signers", JSON.stringify([{ name: "A" }]));
  return new Request("http://localhost/api/sign-requests", {
    method: "POST",
    headers: { "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 250) + 1}`, ...headers },
    body: form,
  });
};

beforeEach(() => {
  vi.resetModules();
  delete (globalThis as { workifyLimits?: unknown }).workifyLimits;
  user = null;
  validateSignInput.mockReset().mockResolvedValue({ signers: [{ name: "A", email: null }] });
  createRequest.mockReset().mockResolvedValue({ id: "r1", manageToken: "m", signers: [] });
});

describe("POST /api/sign-requests", () => {
  // BUG(R2-2): anonymous uploads were allowed up to 100 MB, the same as accounts.
  it("refuses an anonymous upload over the anonymous size limit from its Content-Length", async () => {
    const { POST } = await import("./route");
    const res = await POST(post(1024, { "content-length": String(25 * MB) }));
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe("The file can be at most 20 MB.");
    expect(createRequest).not.toHaveBeenCalled();
  });

  // BUG(R2-2): the anonymous size limit must hold without a Content-Length too.
  it("refuses an anonymous file over the anonymous size limit", async () => {
    const { POST } = await import("./route");
    const res = await POST(post(21 * MB));
    expect(res.status).toBe(413);
    expect(validateSignInput).not.toHaveBeenCalled();
    expect(createRequest).not.toHaveBeenCalled();
  });

  it("accepts the same file from an account", async () => {
    user = { id: 7, name: "Owner", verified: true };
    const { POST } = await import("./route");
    expect((await POST(post(21 * MB))).status).toBe(200);
    expect(createRequest).toHaveBeenCalledOnce();
  });

  // BUG(R2-2): over the per-client or global anonymous caps the request is refused with 429.
  it("answers 429 when an anonymous cap is reached", async () => {
    const { POST } = await import("./route");
    const { AnonymousLimitError } = await import("@/server/sign-requests");
    createRequest.mockRejectedValueOnce(new AnonymousLimitError("client"));
    const client = await POST(post(1024));
    expect(client.status).toBe(429);
    expect((await client.json()).error).toBe("Too many requests. Please wait a few minutes and try again.");
    createRequest.mockRejectedValueOnce(new AnonymousLimitError("global"));
    const global = await POST(post(1024));
    expect(global.status).toBe(429);
    expect((await global.json()).error).toBe("Workify is very busy right now. Please try again in a few minutes.");
  });
});
