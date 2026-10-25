import "server-only";
import { lookup } from "node:dns/promises";
import { existsSync } from "node:fs";
import http from "node:http";
import net, { BlockList, isIP } from "node:net";
import path from "node:path";
import { ToolError } from "./engines";

const PF = process.env.ProgramFiles ?? "C:\\Program Files";
const PF86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";

function chromePath() {
  const candidates = [
    process.env.WORKIFY_CHROME,
    path.join(PF, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(PF86, "Microsoft", "Edge", "Application", "msedge.exe"),
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ];
  const found = candidates.find((c) => c && existsSync(c));
  if (!found) throw new ToolError("No Chrome or Edge browser is installed on this server.");
  return found;
}

// Loopback, private, link-local, shared (CGNAT), reserved, documentation and multicast ranges.
const BLOCKED = new BlockList();
for (const [prefix, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 3],
] as const) BLOCKED.addSubnet(prefix, bits, "ipv4");
for (const [prefix, bits] of [
  ["::", 96], ["64:ff9b:1::", 48], ["100::", 64], ["2001::", 23], ["2001:db8::", 32],
  ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
] as const) BLOCKED.addSubnet(prefix, bits, "ipv6");

function hextets(ip: string) {
  let s = ip.toLowerCase();
  const v4 = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(s);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number);
    s = `${s.slice(0, v4.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = s.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const fill = tail === undefined ? [] : Array<string>(8 - h.length - t.length).fill("0");
  return [...h, ...fill, ...t].map((x) => parseInt(x, 16));
}

/** IPv4 address carried inside a NAT64 (64:ff9b::/96) or 6to4 (2002::/16) IPv6 address. */
function embeddedIPv4(ip: string) {
  const x = hextets(ip);
  const v4 = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  if (x[0] === 0x64 && x[1] === 0xff9b && x.slice(2, 6).every((n) => n === 0)) return v4(x[6], x[7]);
  if (x[0] === 0x2002) return v4(x[1], x[2]);
  return null;
}

export function isPrivateAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return BLOCKED.check(ip, "ipv4");
  // Anything that is not a plain address (including scoped "fe80::1%eth0") is refused.
  if (family !== 6 || ip.includes("%")) return true;
  if (BLOCKED.check(ip, "ipv6")) return true;
  const inner = embeddedIPv4(ip);
  return inner !== null && isPrivateAddress(inner);
}

/** Resolves a host once and returns an address to connect to; throws if any answer is not public. */
export async function resolvePublicAddress(hostname: string) {
  const host = hostname.replace(/^\[(.*)\]$/, "$1");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) {
    throw new Error(`Refusing to connect to ${host}`);
  }
  return addrs[0].address;
}

/** Rejects URLs that point at this machine or a private network. */
export async function checkPublicUrl(raw: string) {
  const input = raw.trim();
  // Any explicit scheme other than http(s) (file:, data:, ftp:, javascript:...) is refused.
  if (/^[a-z][a-z0-9+.-]*:/i.test(input) && !/^https?:\/\//i.test(input)) {
    throw new ToolError("Only http and https pages can be converted.");
  }
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    throw new ToolError("Enter a valid web address, like https://example.com");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new ToolError("Only http and https pages can be converted.");
  const addrs = await lookup(url.hostname.replace(/^\[(.*)\]$/, "$1"), { all: true }).catch(() => {
    throw new ToolError('Could not find the website "{host}".', { host: url.hostname });
  });
  if (addrs.some((a) => isPrivateAddress(a.address))) {
    throw new ToolError("Private and local network addresses cannot be converted.");
  }
  return url;
}

/**
 * Forward proxy that all of Chromium's traffic goes through. Checking a URL and then letting
 * the browser resolve the name again leaves room for DNS rebinding, so the proxy resolves each
 * host once, refuses private answers and connects to exactly the address it checked. It also
 * covers WebSocket and service worker traffic, which request interception does not see.
 */
export async function startEgressProxy(resolve: (host: string) => Promise<string> = resolvePublicAddress) {
  const sockets = new Set<net.Socket>();
  const track = (s: net.Socket) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  };

  const server = http.createServer(async (req, res) => {
    let target: URL;
    try {
      target = new URL(req.url ?? "");
      if (target.protocol !== "http:") throw new Error("Only plain http is forwarded");
    } catch {
      res.writeHead(400).end();
      return;
    }
    let ip: string;
    try {
      ip = await resolve(target.hostname);
    } catch {
      req.socket.destroy();
      return;
    }
    const headers: http.OutgoingHttpHeaders = { ...req.headers, host: req.headers.host ?? target.host };
    delete headers["proxy-connection"];
    delete headers["proxy-authorization"];
    const upstream = http.request(
      {
        host: ip,
        port: Number(target.port) || 80,
        method: req.method,
        path: `${target.pathname}${target.search}`,
        headers,
        setHost: false,
        agent: false,
        timeout: 45_000,
      },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.statusMessage, up.rawHeaders);
        up.on("error", () => res.destroy());
        up.pipe(res);
      },
    );
    upstream.on("timeout", () => upstream.destroy());
    upstream.on("error", () => req.socket.destroy());
    res.on("close", () => upstream.destroy());
    req.pipe(upstream);
  });

  // HTTPS and WebSockets (ws: and wss:) arrive as CONNECT tunnels.
  server.on("connect", async (req: http.IncomingMessage, client: net.Socket, head: Buffer) => {
    client.on("error", () => {});
    const m = /^(\[[^\]]+\]|[^:[\]]+):(\d{1,5})$/.exec(req.url ?? "");
    if (!m) return void client.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    let ip: string;
    try {
      ip = await resolve(m[1]);
    } catch {
      return void client.end("HTTP/1.1 403 Forbidden\r\n\r\n");
    }
    const upstream = net.connect({ host: ip, port: Number(m[2]) });
    track(upstream);
    upstream.setTimeout(45_000, () => upstream.destroy());
    upstream.on("connect", () => {
      upstream.setTimeout(0);
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstream.on("error", () => client.destroy());
    upstream.on("close", () => client.destroy());
    client.on("close", () => upstream.destroy());
  });
  // Plain-http upgrades are not forwarded; Chromium tunnels WebSockets with CONNECT.
  server.on("upgrade", (_req: http.IncomingMessage, socket: net.Socket) => socket.destroy());
  server.on("connection", track);

  await new Promise<void>((ok, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => ok());
  });
  return {
    port: (server.address() as net.AddressInfo).port,
    close: () =>
      new Promise<void>((ok) => {
        server.close(() => ok());
        for (const s of sockets) s.destroy();
      }),
  };
}

export function chromeArgs(proxyPort: number) {
  return [
    "--no-first-run",
    "--disable-extensions",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    // All traffic, loopback included, goes through the egress proxy. Chromium's own resolver
    // is switched off, so nothing can connect to a name the proxy has not checked.
    `--proxy-server=http://127.0.0.1:${proxyPort}`,
    "--proxy-bypass-list=<-loopback>",
    "--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1",
    "--disable-quic",
    "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
    // Without the JIT most V8 exploit techniques stop working.
    "--js-flags=--jitless",
    // Only for hosts that cannot provide Chrome's sandbox; see DEPLOY.md.
    ...(process.env.WORKIFY_CHROME_NO_SANDBOX === "1" ? ["--no-sandbox"] : []),
  ];
}

// Chromium gets only what it needs from the environment, never the app's secrets.
const chromeEnvNames = [
  "PATH", "HOME", "LANG", "LC_ALL", "TZ", "TMPDIR", "TEMP", "TMP", "XDG_RUNTIME_DIR",
  "FONTCONFIG_PATH", "FONTCONFIG_FILE", "SystemRoot", "windir", "LOCALAPPDATA", "APPDATA",
  "USERPROFILE", "ProgramFiles", "ProgramFiles(x86)", "ProgramData",
];

export function chromeEnv() {
  const env: Record<string, string> = {};
  for (const key of chromeEnvNames) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

export async function htmlToPdf(
  rawUrl: string,
  opts: { pageSize: string; orientation: string; margin: string; screenWidth: string; onePage: boolean },
) {
  const url = await checkPublicUrl(rawUrl);
  const puppeteer = await import("puppeteer-core");
  const proxy = await startEgressProxy();
  try {
    const browser = await puppeteer.launch({
      executablePath: chromePath(),
      headless: true,
      args: chromeArgs(proxy.port),
      env: chromeEnv(),
    });
    try {
      const page = await browser.newPage();
      // Re-check every request too (defense in depth; the proxy is what enforces it).
      await page.setRequestInterception(true);
      page.on("request", async (req) => {
        try {
          const u = new URL(req.url());
          if (u.protocol === "data:" || u.protocol === "blob:") return req.continue();
          await checkPublicUrl(u.href);
          await req.continue();
        } catch {
          await req.abort("blockedbyclient").catch(() => {});
        }
      });
      const width = { mobile: 375, tablet: 768, desktop: 1440 }[opts.screenWidth] ?? 1440;
      await page.setViewport({ width, height: 900 });
      await page.goto(url.href, { waitUntil: "networkidle2", timeout: 45_000 }).catch((e: Error) => {
        throw new ToolError("The page could not be loaded: {reason}", { reason: e.message.split("\n")[0] });
      });
      const margin = { none: "0", small: "10mm", big: "25mm" }[opts.margin] ?? "10mm";
      if (opts.onePage) {
        const height = await page.evaluate(() => document.documentElement.scrollHeight);
        return {
          bytes: await page.pdf({ width: `${width}px`, height: `${height + 20}px`, printBackground: true, pageRanges: "1" }),
          host: url.hostname,
        };
      }
      return {
        bytes: await page.pdf({
          format: opts.pageSize === "letter" ? "letter" : "a4",
          landscape: opts.orientation === "landscape",
          printBackground: true,
          margin: { top: margin, bottom: margin, left: margin, right: margin },
        }),
        host: url.hostname,
      };
    } finally {
      await browser.close();
    }
  } finally {
    await proxy.close();
  }
}
