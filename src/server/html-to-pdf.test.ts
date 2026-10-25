import { existsSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromeArgs, chromeEnv, isPrivateAddress, resolvePublicAddress, startEgressProxy } from "./html-to-pdf";

describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.17.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0",
    "192.0.0.170", "198.18.0.1", "224.0.0.1", "255.255.255.255", "::1", "::", "::ffff:127.0.0.1",
    "::ffff:7f00:1", "::7f00:1", "fd00::1", "fe80::1", "febf::1", "fe80::1%eth0", "ff02::1",
    "64:ff9b::a9fe:a9fe", "64:ff9b::10.0.0.1", "2002:a9fe:a9fe::1", "2001:db8::1", "not-an-ip",
  ])("blocks %s", (ip) => expect(isPrivateAddress(ip)).toBe(true));

  it.each(["93.184.215.14", "8.8.8.8", "2606:4700::1111", "64:ff9b::808:808", "2002:808:808::1"])(
    "allows %s",
    (ip) => expect(isPrivateAddress(ip)).toBe(false),
  );
});

describe("resolvePublicAddress", () => {
  it("refuses loopback names and literals", async () => {
    await expect(resolvePublicAddress("localhost")).rejects.toThrow();
    await expect(resolvePublicAddress("127.0.0.1")).rejects.toThrow();
    await expect(resolvePublicAddress("[::1]")).rejects.toThrow();
  });

  it("returns public literals as they are", async () => {
    await expect(resolvePublicAddress("8.8.8.8")).resolves.toBe("8.8.8.8");
  });
});

function connect(port: number, request: string) {
  return new Promise<string>((resolve) => {
    const s = net.connect(port, "127.0.0.1", () => s.write(request));
    let data = "";
    let sent = false;
    s.on("data", (d) => {
      data += d.toString();
      if (!sent && data.startsWith("HTTP/1.1 200 Connection") && data.includes("\r\n\r\n")) {
        // Tunnel is open: talk HTTP to the target through it.
        sent = true;
        s.write("GET /through HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n");
      }
    });
    s.on("close", () => resolve(data));
    s.on("error", () => resolve(data));
  });
}

describe("startEgressProxy", () => {
  const hits: string[] = [];
  let target: http.Server;
  let port = 0;

  beforeAll(async () => {
    target = http.createServer((req, res) => {
      hits.push(`${req.method} ${req.url} host=${req.headers.host}`);
      res.end(req.url === "/through" ? "tunneled" : "private data");
    });
    await new Promise<void>((ok) => target.listen(0, "127.0.0.1", () => ok()));
    port = (target.address() as net.AddressInfo).port;
  });
  afterAll(() => new Promise<void>((ok) => target.close(() => ok())));

  it("refuses private targets for plain http and CONNECT", async () => {
    hits.length = 0;
    const proxy = await startEgressProxy();
    try {
      const plain = await connect(proxy.port, `GET http://127.0.0.1:${port}/ HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\n`);
      expect(plain).not.toContain("private data");
      const tunnel = await connect(proxy.port, `CONNECT localhost:${port} HTTP/1.1\r\nHost: localhost:${port}\r\n\r\n`);
      expect(tunnel).toMatch(/^HTTP\/1\.1 403/);
      expect(hits).toEqual([]);
    } finally {
      await proxy.close();
    }
  });

  it("connects to the address it checked, without resolving the name again", async () => {
    hits.length = 0;
    const asked: string[] = [];
    // Stands in for a rebinding DNS server: the proxy must use this one answer.
    const proxy = await startEgressProxy(async (host) => {
      asked.push(host);
      return "127.0.0.1";
    });
    try {
      const plain = await connect(
        proxy.port,
        `GET http://rebind.invalid:${port}/page?q=1 HTTP/1.1\r\nHost: rebind.invalid:${port}\r\nConnection: close\r\n\r\n`,
      );
      expect(plain).toContain("private data");
      const tunnel = await connect(proxy.port, `CONNECT rebind.invalid:${port} HTTP/1.1\r\nHost: rebind.invalid:${port}\r\n\r\n`);
      expect(tunnel).toContain("tunneled");
      expect(asked).toEqual(["rebind.invalid", "rebind.invalid"]);
      expect(hits).toEqual([`GET /page?q=1 host=rebind.invalid:${port}`, "GET /through host=x"]);
    } finally {
      await proxy.close();
    }
  });
});

describe("chromium launch settings", () => {
  it("sends all traffic through the proxy and keeps secrets out of the environment", () => {
    const args = chromeArgs(1234);
    expect(args).toContain("--proxy-server=http://127.0.0.1:1234");
    expect(args).toContain("--proxy-bypass-list=<-loopback>");
    expect(args).toContain("--js-flags=--jitless");
    process.env.WORKIFY_SECRET_TEST_ONLY = "x";
    try {
      expect(Object.keys(chromeEnv()).some((k) => /SECRET|PASS|KEY/i.test(k))).toBe(false);
    } finally {
      delete process.env.WORKIFY_SECRET_TEST_ONLY;
    }
  });
});

// Real browser check; run with WORKIFY_TEST_CHROME=1 (needs Chrome, Edge or WORKIFY_CHROME).
const chrome = [
  process.env.WORKIFY_CHROME,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((c) => c && existsSync(c));

describe.runIf(process.env.WORKIFY_TEST_CHROME === "1" && chrome)("chromium through the egress proxy", () => {
  it("cannot reach private addresses by navigation, fetch or WebSocket", { timeout: 90_000 }, async () => {
    const hits: string[] = [];
    const server = http.createServer((req, res) => {
      hits.push(req.url ?? "");
      res.setHeader("content-type", "text/html");
      res.end(
        req.url === "/start"
          ? `<script>
              fetch("http://127.0.0.1:" + location.port + "/fetch").catch(() => {});
              try { new WebSocket("ws://127.0.0.1:" + location.port + "/ws"); } catch {}
              setTimeout(() => { location = "http://127.0.0.1:" + location.port + "/nav"; }, 500);
            </script>start`
          : "private",
      );
    });
    server.on("upgrade", (req, socket) => {
      hits.push(`upgrade ${req.url}`);
      socket.destroy();
    });
    await new Promise<void>((ok) => server.listen(0, "127.0.0.1", () => ok()));
    const port = (server.address() as net.AddressInfo).port;
    // Only the made-up name "pinned.invalid" maps to the test server; the browser cannot
    // resolve it itself, so loading it at all proves every request goes through the proxy.
    const proxy = await startEgressProxy(async (host) => (host === "pinned.invalid" ? "127.0.0.1" : resolvePublicAddress(host)));
    const puppeteer = await import("puppeteer-core");
    const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: chromeArgs(proxy.port), env: chromeEnv() });
    try {
      const page = await browser.newPage();
      await page.goto(`http://pinned.invalid:${port}/start`, { waitUntil: "load" });
      await new Promise((r) => setTimeout(r, 2000));
      await expect(page.goto(`http://127.0.0.1:${port}/direct`)).rejects.toThrow();
      expect(hits.filter((h) => h !== "/favicon.ico")).toEqual(["/start"]);
    } finally {
      // Closing can stall on some desktops; the outcome is already known by now.
      await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 5000))]);
      browser.process()?.kill();
      await proxy.close();
      server.closeAllConnections();
      await new Promise<void>((ok) => server.close(() => ok()));
    }
  });
});
