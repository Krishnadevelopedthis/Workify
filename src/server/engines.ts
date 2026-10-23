import "server-only";
import { execFile } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { pyPool } from "./py-pool";

/** Finds the first existing path; env var overrides win. */
function locate(envVar: string, candidates: () => string[]): string | null {
  const fromEnv = process.env[envVar];
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  for (const c of candidates()) if (existsSync(c)) return c;
  return null;
}

function versionedDirs(root: string, prefix: string) {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((d) => d.toLowerCase().startsWith(prefix))
    .sort()
    .reverse()
    .map((d) => path.join(root, d));
}

const PF = process.env.ProgramFiles ?? "C:\\Program Files";

export const engines = {
  get ghostscript() {
    return locate("WORKIFY_GS", () => [
      ...versionedDirs(path.join(PF, "gs"), "gs").map((d) => path.join(d, "bin", "gswin64c.exe")),
      "/usr/bin/gs",
    ]);
  },
  get qpdf() {
    return locate("WORKIFY_QPDF", () => [
      ...versionedDirs(PF, "qpdf").map((d) => path.join(d, "bin", "qpdf.exe")),
      "/usr/bin/qpdf",
    ]);
  },
  get soffice() {
    return locate("WORKIFY_SOFFICE", () => [
      path.join(PF, "LibreOffice", "program", "soffice.exe"),
      "/usr/bin/soffice",
    ]);
  },
  get tesseractDir() {
    const exe = locate("WORKIFY_TESSERACT", () => [
      path.join(PF, "Tesseract-OCR", "tesseract.exe"),
      "/usr/bin/tesseract",
    ]);
    return exe ? path.dirname(exe) : null;
  },
  /** Folder with *.traineddata files: the project's data/tessdata (extra languages) or the system one. */
  get tessdata() {
    const candidates = [
      process.env.WORKIFY_TESSDATA,
      path.join(/* turbopackIgnore: true */ process.cwd(), "data", "tessdata"),
      path.join(PF, "Tesseract-OCR", "tessdata"),
      ...versionedDirs("/usr/share/tesseract-ocr", "").map((d) => path.join(d, "tessdata")),
      "/usr/share/tessdata",
    ];
    // Tesseract also needs the "configs" folder (hocr/txt output settings) next to the models.
    return candidates.find((d) => d && existsSync(path.join(d, "eng.traineddata")) && existsSync(path.join(d, "configs"))) ?? null;
  },
  get python() {
    return locate("WORKIFY_PYTHON", () => [
      path.join(/* turbopackIgnore: true */ process.cwd(), "py", ".venv", "Scripts", "python.exe"),
      path.join(/* turbopackIgnore: true */ process.cwd(), "py", ".venv", "bin", "python"),
    ]);
  },
};

export class EngineMissingError extends Error {}

export function need(name: keyof typeof engines): string {
  const p = engines[name];
  if (!p) throw new EngineMissingError(`The ${name} engine is not installed on this server.`);
  return p;
}

/**
 * A problem the user can fix, shown to them as-is. The English `template`
 * (with {placeholders}) is also the translation key; `vars` fill it in.
 */
export class ToolError extends Error {
  constructor(
    readonly template: string,
    readonly vars?: Record<string, string | number>,
  ) {
    super(vars ? template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : template);
  }
}

export function run(
  file: string,
  args: string[],
  opts: { timeoutMs?: number; env?: NodeJS.ProcessEnv; cwd?: string } = {},
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      {
        timeout: opts.timeoutMs ?? 180_000,
        maxBuffer: 64 * 1024 * 1024,
        windowsHide: true,
        env: opts.env ?? process.env,
        cwd: opts.cwd,
      },
      (err, stdout, stderr) => {
        if (err) {
          const detail = (stderr || stdout || err.message).toString().trim().split("\n").slice(-3).join(" ");
          reject(Object.assign(new Error(detail), { code: (err as { code?: unknown }).code, stdout, stderr }));
        } else resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
      },
    );
  });
}

/** Runs one command of py/workify_tools.py on a warm worker process. */
export async function python(command: string, args: string[], timeoutMs = 300_000) {
  const py = need("python");
  const tess = engines.tesseractDir;
  const gs = engines.ghostscript;
  const extraPath = [tess, gs && path.dirname(gs)].filter(Boolean).join(path.delimiter);
  const tessdata = engines.tessdata;
  const env = {
    ...process.env,
    PYTHONIOENCODING: "utf-8",
    PATH: extraPath ? `${extraPath}${path.delimiter}${process.env.PATH ?? ""}` : process.env.PATH,
    ...(tessdata ? { TESSDATA_PREFIX: tessdata } : {}),
  };
  let result: Record<string, unknown>;
  try {
    result = await pyPool(py, env).run(command, args, timeoutMs);
  } catch (e) {
    if (String(e).includes("timed out")) throw new ToolError("This file took too long to process. Try a smaller file.");
    throw e;
  }
  if (typeof result.error === "string") throw new ToolError(result.error);
  return result;
}
