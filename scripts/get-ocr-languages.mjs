// Downloads the OCR languages offered by Workify into data/tessdata (for local
// Windows/macOS installs; the Docker image installs them with apt instead).
// Run: npm run ocr-languages
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dest = path.join(root, "data", "tessdata");
const toolsSrc = readFileSync(path.join(root, "src", "lib", "tools.ts"), "utf8");
// Only the OCR_LANGUAGES list, so other [value, label] pairs in the file are ignored.
const block = toolsSrc.slice(toolsSrc.indexOf("OCR_LANGUAGES"), toolsSrc.indexOf("];", toolsSrc.indexOf("OCR_LANGUAGES")));
const codes = [...block.matchAll(/\["([a-z_]+)", "[^"]+"\]/g)].map((m) => m[1]);

// The system Tesseract install provides eng/osd and the "configs" folder OCR needs.
const systemDirs = [
  process.env.WORKIFY_TESSDATA,
  path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Tesseract-OCR", "tessdata"),
  "/opt/homebrew/share/tessdata",
  "/usr/local/share/tessdata",
].filter(Boolean);
const system = systemDirs.find((d) => existsSync(path.join(d, "configs")));
if (!system) {
  console.error("Install Tesseract first (Windows: winget install UB-Mannheim.TesseractOCR).");
  process.exit(1);
}

mkdirSync(dest, { recursive: true });
for (const f of ["eng.traineddata", "osd.traineddata", "pdf.ttf"]) {
  if (existsSync(path.join(system, f))) copyFileSync(path.join(system, f), path.join(dest, f));
}
for (const d of ["configs", "tessconfigs"]) {
  if (existsSync(path.join(system, d))) cpSync(path.join(system, d), path.join(dest, d), { recursive: true });
}

let failed = [];
for (const code of codes) {
  const file = path.join(dest, `${code}.traineddata`);
  if (existsSync(file)) continue;
  process.stdout.write(`${code}… `);
  try {
    const res = await fetch(`https://github.com/tesseract-ocr/tessdata_fast/raw/main/${code}.traineddata`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(`${file}.part`, Buffer.from(await res.arrayBuffer()));
    renameSync(`${file}.part`, file);
    console.log("ok");
  } catch (e) {
    console.log(`failed (${e.message})`);
    failed.push(code);
  }
}
console.log(failed.length ? `Done, but these failed: ${failed.join(", ")}. Run again to retry.` : `All ${codes.length} languages ready in data/tessdata.`);
