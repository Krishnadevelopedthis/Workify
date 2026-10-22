import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

// Only the hosts the optional Google Drive / Dropbox pickers need.
const GOOGLE = "https://apis.google.com https://accounts.google.com";
const DROPBOX = "https://www.dropbox.com";

const csp = [
  "default-src 'self'",
  // Next.js inlines small bootstrap scripts; dev mode also needs eval for HMR.
  `script-src 'self' 'unsafe-inline' ${dev ? "'unsafe-eval'" : ""} ${GOOGLE} ${DROPBOX}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self' ${dev ? "ws: " : ""}https://www.googleapis.com ${DROPBOX} https://*.dropboxusercontent.com`,
  `frame-src https://docs.google.com https://accounts.google.com https://content.googleapis.com ${DROPBOX}`,
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The camera is used by Scan to PDF on this site only.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
  // Google sign-in for the Drive picker opens a popup.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  // Browsers only honour this over HTTPS; harmless on plain HTTP.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Tailwind's atomic CSS is small; inlining it removes a render-blocking request.
  experimental: { inlineCss: true },
  // Native/binary-backed packages must stay outside the server bundle.
  serverExternalPackages: ["puppeteer-core"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Unhashed public assets: cache for a day (Next's /_next/static files are already immutable).
      {
        source: "/:file(pdf.worker.min.mjs|icon.svg|icon-192.png|icon-512.png)",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
    ];
  },
};

export default nextConfig;
