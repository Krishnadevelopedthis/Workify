import { beforeEach, describe, expect, it, vi } from "vitest";

const from = (ip: string) => new Headers({ "x-forwarded-for": ip });

beforeEach(() => {
  vi.resetModules();
  delete (globalThis as { workifyLimits?: unknown }).workifyLimits;
  vi.unstubAllEnvs();
});

describe("rateLimit", () => {
  it("does not let one client's refused requests use up the global window", async () => {
    const { rateLimit, LIMITS } = await import("./rate-limit");
    let refused = 0;
    for (let i = 0; i < LIMITS.auth.global + 10; i++) if (rateLimit("auth", from("198.51.100.66"))) refused++;
    expect(refused).toBe(LIMITS.auth.global + 10 - LIMITS.auth.perClient);
    expect(rateLimit("auth", from("192.0.2.10"))).toBeNull();
  });

  it("does not count requests refused by the extra key against the client or global window", async () => {
    const { rateLimit, LIMITS } = await import("./rate-limit");
    const extraLimit = Math.ceil(LIMITS.email.perClient / 2);
    for (let i = 0; i < extraLimit; i++) expect(rateLimit("email", from("203.0.113.1"), "manage:1")).toBeNull();
    expect(rateLimit("email", from("203.0.113.1"), "manage:1")).toMatch(/Too many attempts/);
    for (let i = extraLimit; i < LIMITS.email.perClient; i++) expect(rateLimit("email", from("203.0.113.1"), `manage:${i}`)).toBeNull();
    expect(rateLimit("email", from("203.0.113.1"), "manage:x")).toMatch(/Too many requests/);
  });

  it("still enforces the global limit across many clients", async () => {
    const { rateLimit, LIMITS } = await import("./rate-limit");
    const { perClient, global } = LIMITS.contact;
    let n = 0;
    for (let c = 0; n < global; c++) for (let i = 0; i < perClient && n < global; i++, n++) expect(rateLimit("contact", from(`10.0.${c}.1`))).toBeNull();
    expect(rateLimit("contact", from("10.9.9.9"))).toMatch(/very busy/);
  });

  it("puts all addresses of one IPv6 /64 in one bucket", async () => {
    const { rateLimit, LIMITS } = await import("./rate-limit");
    for (let i = 0; i < LIMITS.contact.perClient; i++) expect(rateLimit("contact", from(`2001:db8:1:2::${i + 1}`))).toBeNull();
    expect(rateLimit("contact", from("2001:db8:1:2:ffff::9"))).toMatch(/Too many requests/);
    expect(rateLimit("contact", from("2001:db8:1:3::1"))).toBeNull();
  });
});

describe("clientBucket", () => {
  it("normalizes addresses", async () => {
    const { clientBucket } = await import("./rate-limit");
    expect(clientBucket("203.0.113.5")).toBe("203.0.113.5");
    expect(clientBucket("::ffff:203.0.113.5")).toBe("203.0.113.5");
    expect(clientBucket("2001:0db8:0001:0002:0003:0004:0005:0006")).toBe("2001:db8:1:2::/64");
    expect(clientBucket("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(clientBucket("[2001:db8:1:2::1]:443")).toBe("2001:db8:1:2::/64");
    expect(clientBucket("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
    expect(clientBucket("local")).toBe("local");
    expect(clientBucket("1::2::3")).toBe("1::2::3");
  });
});

describe("clientIp", () => {
  it("takes the entry added by the last trusted proxy", async () => {
    vi.stubEnv("WORKIFY_TRUST_PROXY", "2");
    const { clientIp } = await import("./rate-limit");
    expect(clientIp(from("6.6.6.6, 198.51.100.1, 172.16.0.1"))).toBe("198.51.100.1");
  });

  it("warns once when the header is shorter than the proxy chain", async () => {
    vi.stubEnv("WORKIFY_TRUST_PROXY", "2");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { clientIp } = await import("./rate-limit");
    expect(clientIp(from("172.16.0.1"))).toBe("172.16.0.1");
    clientIp(from("172.16.0.2"));
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
