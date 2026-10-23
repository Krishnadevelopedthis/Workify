// Collects every English interface string (the translation keys) from src/.
//   node scripts/i18n-extract.mjs            -> writes src/i18n/keys.json
//   node scripts/i18n-extract.mjs --check    -> fails if a language misses keys
//
// A string is a key when it is:
//   - the first argument of t("…") (also inside rich(t("…"), …)),
//   - the value of a UI property (label, title, text, description, …),
//   - a text-like string inside an UPPER_CASE constant (FAQ, SECTIONS, menus…),
//     including the keys of such constant objects (menu group names).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "src");
const KEYS_FILE = path.join(SRC, "i18n", "keys.json");
const MESSAGES = path.join(SRC, "i18n", "messages");

const UI_PROPS = new Set([
  "label", "hint", "placeholder", "title", "subtitle", "text", "description", "name", "action",
  "acceptLabel", "unavailable", "excerpt", "heading", "confirmText",
]);
// Data fields that are never shown as text.
const DATA_PROPS = new Set([
  "value", "accept", "icon", "color", "badge", "key", "type", "slug", "href", "category", "editor",
  "default", "id", "kind", "font", "url", "method", "mode", "equals", "image", "date",
]);
// Server-only code whose text is deliberately English (audit certificate, admin action errors, logs).
const SKIP_FILES = [/i18n[\\/]config\.ts$/, /server[\\/]sign-requests\.ts$/, /actions[\\/]admin\.ts$/, /server[\\/]monitor\.ts$/, /server[\\/]emails\.ts$/];

const looksLikeText = (s) =>
  /[A-Za-z]{2}/.test(s) &&
  !/^(\/|#|https?:|mailto:|data:|[a-z]+\/[a-z+.-]+$)/.test(s) && // paths, colors, URLs, mime types
  !/^[a-z0-9]+([-_.][a-z0-9]+)*$/.test(s) && // slugs, icon names, keys
  !/^[a-z]+[A-Z][A-Za-z]*$/.test(s) && // camelCase identifiers
  !/^\.[a-z0-9]+(,|$)/.test(s) && // file extension lists
  !/\b(bg|text|border|ring)-\[?[#a-z0-9]/.test(s) && // Tailwind class lists
  !/, (sans-serif|serif|monospace)$/.test(s) && // CSS font stacks
  !/^\d+(\.\d+)? ?(px|DPI|pt)$/.test(s) && // measurements
  !/;\s*charset=/.test(s) && // content types
  !/^[a-z-]+(:[a-z0-9-]+)?(\s+[!a-z0-9:/[\]#().%-]+)+$/.test(s) && // Tailwind class lists
  !/^[A-Z_]+$/.test(s);

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(path.join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : [],
  );
}

const keys = new Set();

function inUpperConst(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return /^[A-Z][A-Z0-9_]+$/.test(p.name.text);
    if (ts.isFunctionLike(p)) return false;
  }
  return false;
}

for (const file of files(SRC)) {
  if (SKIP_FILES.some((re) => re.test(file))) {
    // emails.ts still uses t(): only its t() calls count.
    if (!/emails\.ts$/.test(file)) continue;
  }
  const onlyCalls = /emails\.ts$/.test(file);
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (node) => {
    const isString = (n) => n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n));
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "t") {
      if (isString(node.arguments[0])) keys.add(node.arguments[0].text);
    } else if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && /^(ToolError|TaskError|SignInputError)$/.test(node.expression.text)) {
      // Errors shown to users are translated with their English template as the key.
      const arg = node.arguments?.[node.expression.text === "TaskError" ? 1 : 0];
      if (isString(arg)) keys.add(arg.text);
    } else if (/rate-limit\.ts$/.test(file) && isString(node) && / /.test(node.text) && /^[A-Z]/.test(node.text)) {
      keys.add(node.text); // rate limit and busy messages
    } else if (!onlyCalls && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && looksLikeText(node.text)) {
      const parent = node.parent;
      if (ts.isPropertyAssignment(parent) && parent.initializer === node) {
        const prop = parent.name.getText(source).replace(/["']/g, "");
        if (UI_PROPS.has(prop) || (inUpperConst(node) && !DATA_PROPS.has(prop))) keys.add(node.text);
      } else if (ts.isPropertyAssignment(parent) && parent.name === node && inUpperConst(node)) {
        keys.add(node.text); // object keys such as menu group names
      } else if (ts.isArrayLiteralExpression(parent) && inUpperConst(node)) {
        keys.add(node.text);
      } else if (ts.isJsxAttribute(parent) && /^(confirmText)$/.test(parent.name.getText(source))) {
        keys.add(node.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

// Messages from the Python converters (fail("…")), shown to users as tool errors.
const py = readFileSync(path.join(ROOT, "py", "workify_tools.py"), "utf8");
for (const m of py.matchAll(/fail\("([^"]+)"\)/g)) keys.add(m[1]);
for (const m of py.matchAll(/return \{"error": "([^"{}]+)"\}/g)) keys.add(m[1]);

const sorted = [...keys].sort((a, b) => a.localeCompare(b));

if (process.argv.includes("--check")) {
  let missing = 0;
  for (const name of readdirSync(MESSAGES).filter((n) => n.endsWith(".json"))) {
    const messages = JSON.parse(readFileSync(path.join(MESSAGES, name), "utf8"));
    const absent = sorted.filter((k) => !(k in messages));
    // Every {placeholder} and <tag>…</tag> of the English text must survive translation.
    const tokens = (s) => [...s.matchAll(/\{\w+\}|<\/?\w+>/g)].map(([v]) => v);
    const badVars = sorted.filter((k) => k in messages && tokens(k).some((v) => !messages[k].includes(v)));
    if (absent.length || badVars.length) {
      missing += absent.length + badVars.length;
      console.error(`${name}: ${absent.length} missing, ${badVars.length} with wrong {placeholders}`);
      for (const k of [...absent, ...badVars].slice(0, 10)) console.error(`  - ${k}`);
    }
  }
  if (missing) process.exit(1);
  console.log(`All languages have all ${sorted.length} strings.`);
} else {
  writeFileSync(KEYS_FILE, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`${sorted.length} strings -> ${path.relative(ROOT, KEYS_FILE)}`);
}
