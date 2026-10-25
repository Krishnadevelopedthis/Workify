import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ db: {} }));
vi.mock("./monitor", () => ({ logError: () => {} }));
vi.mock("./secret", () => ({ derive: (s: string) => s }));

const { isBlockedAddress, postOnce, publicOnlyLookup } = await import("./webhooks");

describe("isBlockedAddress", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0",
    "198.18.0.1", "224.0.0.1", "255.255.255.255", "::1", "::", "fd00::1", "fe80::1", "ff02::1",
    "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe", "64:ff9b::10.0.0.1", "not-an-ip",
  ])("blocks %s", (ip) => expect(isBlockedAddress(ip)).toBe(true));

  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("allows %s", (ip) =>
    expect(isBlockedAddress(ip)).toBe(false),
  );
});

describe("publicOnlyLookup", () => {
  const run = (host: string, all: boolean) =>
    new Promise<{ err: NodeJS.ErrnoException | null; address: unknown }>((resolve) =>
      publicOnlyLookup(host, { all }, (err, address) => resolve({ err, address })),
    );

  it("refuses names that resolve to a private address", async () => {
    expect((await run("localhost", false)).err?.code).toBe("EPRIVATEADDR");
    expect((await run("127.0.0.1", true)).err?.code).toBe("EPRIVATEADDR");
  });

  it("passes public addresses through in both callback forms", async () => {
    expect(await run("8.8.8.8", false)).toEqual({ err: null, address: "8.8.8.8" });
    expect(await run("8.8.8.8", true)).toEqual({ err: null, address: [{ address: "8.8.8.8", family: 4 }] });
  });
});

describe("postOnce", () => {
  let server: Server;
  let port = 0;
  let hits = 0;
  beforeAll(async () => {
    server = createServer((_req, res) => {
      hits++;
      res.end("ok");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  // A name that resolved to a public address when it was validated but to an
  // internal one when connecting (DNS rebinding) must never be reached.
  it("does not connect when the name resolves to a private address", async () => {
    await expect(postOnce(`http://localhost:${port}/hook`, {}, "{}")).rejects.toMatchObject({ code: "EPRIVATEADDR" });
    await expect(postOnce(`http://127.0.0.1:${port}/hook`, {}, "{}")).rejects.toThrow(/private/);
    await expect(postOnce(`http://[::ffff:127.0.0.1]:${port}/hook`, {}, "{}")).rejects.toThrow(/private/);
    expect(hits).toBe(0);
  });
});
