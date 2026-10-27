import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Keep the generated key out of the project's data/ folder.
const dataDir = vi.hoisted(() => ({ path: "" }));
vi.mock("./db", async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  dataDir.path = mkdtempSync(path.join(tmpdir(), "workify-secret-"));
  return { DATA_DIR: dataDir.path };
});

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv("WORKIFY_SECRET", "");
});
afterAll(() => {
  vi.unstubAllEnvs();
  if (dataDir.path) rmSync(dataDir.path, { recursive: true, force: true });
});

describe("seal / unseal", () => {
  it("round-trips text, including unicode and empty strings", async () => {
    const { seal, unseal } = await import("./secret");
    for (const plain of ["token-123", "नमस्ते 🌍", ""]) expect(unseal(seal(plain))).toBe(plain);
  });

  it("uses a fresh IV each time", async () => {
    const { seal, unseal } = await import("./secret");
    const a = seal("same");
    const b = seal("same");
    expect(a).not.toBe(b);
    expect(a.split(".")).toHaveLength(3);
    expect(unseal(a)).toBe("same");
    expect(unseal(b)).toBe("same");
  });

  it("rejects tampered or malformed values", async () => {
    const { seal, unseal } = await import("./secret");
    const [iv, tag, data] = seal("pay $10 to alice").split(".");
    const flip = (s: string) => {
      const buf = Buffer.from(s, "base64url");
      buf[0] ^= 1;
      return buf.toString("base64url");
    };
    expect(unseal([iv, tag, flip(data)].join("."))).toBeNull();
    expect(unseal([iv, flip(tag), data].join("."))).toBeNull();
    expect(unseal([flip(iv), tag, data].join("."))).toBeNull();
    expect(unseal([iv, tag].join("."))).toBeNull();
    expect(unseal("")).toBeNull();
    expect(unseal("not a sealed value")).toBeNull();
  });

  it("generates and reuses a key file when WORKIFY_SECRET is not set", async () => {
    const first = await import("./secret");
    const sealed = first.seal("persisted");
    const keyFile = path.join(dataDir.path, "secret.key");
    expect(existsSync(keyFile)).toBe(true);
    expect(Buffer.from(readFileSync(keyFile, "utf8"), "base64")).toHaveLength(32);

    vi.resetModules();
    const second = await import("./secret");
    expect(second.unseal(sealed)).toBe("persisted");
  });

  it("derives the key from WORKIFY_SECRET, so a different secret cannot unseal", async () => {
    vi.stubEnv("WORKIFY_SECRET", "secret-one");
    const one = await import("./secret");
    const sealed = one.seal("hello");
    expect(one.unseal(sealed)).toBe("hello");

    vi.resetModules();
    vi.stubEnv("WORKIFY_SECRET", "secret-two");
    const two = await import("./secret");
    expect(two.unseal(sealed)).toBeNull();
  });
});
