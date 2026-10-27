// Builds a small offline subset of the free Tabler icon set (via Iconify)
// so the site never needs the Iconify API at runtime.
// Run: node scripts/build-icons.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { getIcons } from "@iconify/utils";

const require = createRequire(import.meta.url);
const tabler = JSON.parse(
  readFileSync(require.resolve("@iconify-json/tabler/icons.json"), "utf8"),
);

const names = [
  // tools
  "arrows-join-2", "arrows-split-2", "arrows-minimize", "file-export", "file-import",
  "edit", "photo-down", "photo-up", "signature", "droplet-half-2", "rotate-clockwise",
  "world-www", "lock-open", "lock", "layout-grid", "archive", "tool", "list-numbers",
  "scan", "text-recognition", "git-compare", "eye-off", "crop", "forms", "sparkles",
  "language", "markdown", "route", "file-minus", "file-symlink",
  // ui
  "upload", "brand-google-drive", "brand-dropbox", "x", "plus", "trash", "download",
  "chevron-down", "chevron-right", "grid-dots", "menu-2", "user", "logout", "check",
  "arrow-left", "arrow-right", "sort-ascending-letters", "rotate", "rotate-2", "file",
  "file-type-pdf", "loader-2", "alert-triangle", "share", "brand-x", "brand-facebook",
  "brand-linkedin", "brand-instagram", "brand-tiktok", "brand-reddit", "device-desktop",
  "device-mobile", "building", "school", "shield-check", "mail", "crown", "camera",
  "qrcode", "square", "circle", "line", "pencil", "typography", "photo", "eraser",
  "arrow-back-up", "zoom-in", "zoom-out", "checkbox", "calendar", "info-circle",
  "settings", "copy", "grip-vertical", "search", "player-play", "file-plus", "eye",
  "clock", "heart", "bolt", "cloud-off", "users", "help-circle", "news", "speakerphone",
  "letter-case", "refresh", "device-floppy", "player-stop", "adjustments", "filter",
  // accounts, admin, signing, developers, languages
  "key", "webhook", "code", "layout-dashboard", "send", "bell", "history", "certificate",
  "template", "world", "user-x", "mail-check", "chart-bar", "database", "alert-circle",
  "inbox", "plug", "cloud-upload", "list-check", "external-link", "user-check", "users-group",
  "arrow-up", "arrow-down", "lock-check", "file-certificate", "player-skip-forward", "dots",
  "toggle-right", "brand-zapier", "circle-check", "progress", "terminal-2", "receipt",
  // form fields
  "message-2", "tag",
];

const subset = getIcons(tabler, names);
const missing = names.filter((n) => !subset?.icons[n] && !subset?.aliases?.[n]);
if (missing.length) {
  console.error("Missing Tabler icons:", missing.join(", "));
  process.exit(1);
}
writeFileSync(
  new URL("../src/lib/icons.json", import.meta.url),
  JSON.stringify(subset),
);
console.log(`Wrote ${names.length} icons to src/lib/icons.json`);
