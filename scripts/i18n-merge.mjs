// Adds index-keyed translation parts to src/i18n/messages/<lang>.json:
//   node scripts/i18n-merge.mjs <lang> <part.json> [<part.json> ...]
// Each part is { "<index in keys.json>": "<translation>" }. Existing
// translations are kept unless a part replaces them; keys no longer in
// keys.json are dropped. Brand and font names are filled in automatically.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const keys = JSON.parse(readFileSync(path.join(ROOT, "src/i18n/keys.json"), "utf8"));
const [lang, ...parts] = process.argv.slice(2);
if (!lang || !parts.length) throw new Error("usage: i18n-merge.mjs <lang> <part.json>...");

const SAME = new Set([
  "Workify", "Facebook", "Instagram", "LinkedIn", "Reddit", "TikTok", "X (Twitter)", "Zapier", "Make",
  "Helvetica", "Courier", "PDF/A-1b", "PDF/A-2b", "PDF/A-3b",
]);

const target = path.join(ROOT, "src/i18n/messages", `${lang}.json`);
const out = existsSync(target) ? JSON.parse(readFileSync(target, "utf8")) : {};
for (const k of keys) if (SAME.has(k)) out[k] = k;
for (const file of parts) {
  const part = JSON.parse(readFileSync(file, "utf8"));
  for (const [index, value] of Object.entries(part)) {
    const key = keys[Number(index)];
    if (key === undefined) throw new Error(`${file}: index ${index} does not exist`);
    if (typeof value !== "string" || !value.trim()) throw new Error(`${file}: empty translation for ${index}`);
    out[key] = value;
  }
}
const missing = keys.filter((k) => !(k in out));
const sorted = Object.fromEntries(keys.filter((k) => k in out).map((k) => [k, out[k]]));
writeFileSync(target, JSON.stringify(sorted, null, 1) + "\n");
console.log(`${lang}: ${Object.keys(sorted).length}/${keys.length} strings${missing.length ? `, missing indexes: ${missing.map((k) => keys.indexOf(k)).join(",")}` : ""}`);
