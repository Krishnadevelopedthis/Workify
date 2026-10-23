import "server-only";
import { lookup } from "node:dns/promises";
import { existsSync } from "node:fs";
import { isIP } from "node:net";
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

function isPrivateAddress(ip: string) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 10 || a === 127 || a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
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
  const addrs = await lookup(url.hostname, { all: true }).catch(() => {
    throw new ToolError('Could not find the website "{host}".', { host: url.hostname });
  });
  if (addrs.some((a) => isPrivateAddress(a.address))) {
    throw new ToolError("Private and local network addresses cannot be converted.");
  }
  return url;
}

export async function htmlToPdf(
  rawUrl: string,
  opts: { pageSize: string; orientation: string; margin: string; screenWidth: string; onePage: boolean },
) {
  const url = await checkPublicUrl(rawUrl);
  const puppeteer = await import("puppeteer-core");
  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: [
      "--no-first-run",
      "--disable-extensions",
      "--disable-dev-shm-usage",
      // Containers usually cannot create Chrome's sandbox; the Docker image opts out
      // explicitly. Pages are still limited to public addresses by checkPublicUrl.
      ...(process.env.WORKIFY_CHROME_NO_SANDBOX === "1" ? ["--no-sandbox"] : []),
    ],
  });
  try {
    const page = await browser.newPage();
    // Re-check every request so a redirect cannot reach a private address.
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
}
