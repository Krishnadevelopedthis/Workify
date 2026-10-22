// Copies the pdf.js worker into /public so the browser can load it by URL.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const src = require.resolve("pdfjs-dist/build/pdf.worker.min.mjs");
mkdirSync(new URL("../public/", import.meta.url), { recursive: true });
copyFileSync(src, new URL("../public/pdf.worker.min.mjs", import.meta.url));
console.log("Copied pdf.worker.min.mjs to public/");
