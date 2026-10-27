import "server-only";
import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import JSZip from "jszip";
import { TOOL_BY_SLUG, WORKFLOW_STEPS } from "@/lib/tools";
import { EngineMissingError, ToolError } from "./engines";
import { htmlToPdf } from "./html-to-pdf";
import { createJob, deleteJob, saveUpload, type Job, type JobFile } from "./jobs";
import { logError, recordTask } from "./monitor";
import { PROCESSORS, type Ctx, type Output } from "./processors";
import { BusyError, heavyGate } from "./rate-limit";

// Runs one tool on uploaded files for the website (/api/process).

export const LIMITS = {
  maxFile: 200 * 1024 * 1024,
  maxTotal: 500 * 1024 * 1024,
  maxFiles: 100,
  maxExtras: 10,
  maxExtraSize: 20 * 1024 * 1024,
};

export type TaskInput = {
  slug: string;
  files: File[];
  /** Option values; non-strings are JSON-encoded, as the processors expect. */
  options: Record<string, unknown>;
  /** Extra uploads (watermark image, signatures) by key. */
  extras: [string, File][];
};

export type TaskResult = {
  jobId: string;
  fileName: string;
  size: number;
  inputSize: number;
  count: number;
  downloadUrl: string;
  /** The single PDF result can be handed to another tool. */
  continuable: boolean;
};

/** An error with an HTTP status. `template` (+ `vars`) is the translation key; `message` is the English text. */
export class TaskError extends ToolError {
  constructor(
    readonly status: number,
    template: string,
    vars?: Record<string, string | number>,
  ) {
    super(template, vars);
  }
}

/** The tool, if it exists and is available. Throws TaskError. */
export function checkTool(slug: string) {
  const tool = TOOL_BY_SLUG.get(slug);
  if (!tool) throw new TaskError(404, "Unknown tool.");
  if (tool.unavailable) throw new TaskError(503, tool.unavailable);
  return tool;
}

/** Checks the request before anything is stored. Throws TaskError. */
export function validateTask(input: Pick<TaskInput, "slug" | "files">) {
  const tool = checkTool(input.slug);
  const { files } = input;
  if (files.length > LIMITS.maxFiles) throw new TaskError(400, "You can process at most {max} files at once.", { max: LIMITS.maxFiles });
  if (files.some((f) => f.size > LIMITS.maxFile)) throw new TaskError(413, "Each file can be at most 200 MB.");
  if (files.reduce((s, f) => s + f.size, 0) > LIMITS.maxTotal) throw new TaskError(413, "All files together can be at most 500 MB.");
  if (input.slug !== "html-to-pdf" && files.length === 0) throw new TaskError(400, "Select at least one file.");
  if (!tool.multiple && files.length > 1 && input.slug !== "html-to-pdf") throw new TaskError(400, "This tool works on one file at a time.");
  return tool;
}

const asStrings = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));

export async function runTask(input: TaskInput): Promise<TaskResult> {
  validateTask(input);
  const started = Date.now();
  const inputSize = input.files.reduce((s, f) => s + f.size, 0);
  const job = await createJob();
  let succeeded = false;
  try {
    const inputs: JobFile[] = [];
    for (const [i, f] of input.files.entries()) inputs.push(await saveUpload(job, f, i));
    const extras: Record<string, JobFile> = {};
    let n = 1000;
    for (const [key, file] of input.extras) {
      if (n >= 1000 + LIMITS.maxExtras) break;
      if (/^[\w-]{1,40}$/.test(key) && file.size <= LIMITS.maxExtraSize) extras[key] = await saveUpload(job, file, n++);
    }

    const outputs = await heavyGate.run(() => runTool(input.slug, job, inputs, asStrings(input.options), extras));
    if (!outputs.length) throw new TaskError(500, "The tool produced no files.");

    let download: Output;
    if (outputs.length === 1) {
      download = outputs[0];
    } else {
      const zip = new JSZip();
      const used = new Set<string>();
      for (const o of outputs) {
        let name = o.name;
        for (let k = 2; used.has(name); k++) name = o.name.replace(/(\.[^.]+)?$/, `_${k}$1`);
        used.add(name);
        zip.file(name, createReadStream(o.path));
      }
      const zipName = `workify_${input.slug}.zip`;
      const zipPath = path.join(job.dir, zipName);
      // Streamed from disk to disk: outputs can add up to far more than fits in memory.
      await pipeline(
        zip.generateNodeStream({ type: "nodebuffer", compression: "DEFLATE", streamFiles: true }),
        createWriteStream(zipPath),
      );
      download = { path: zipPath, name: zipName };
    }
    const finalDir = path.join(job.dir, "download");
    await mkdir(finalDir, { recursive: true });
    await copyFile(download.path, path.join(finalDir, download.name));
    // The path is always inside the OS temp folder, never project files.
    const size = (await stat(/*turbopackIgnore: true*/ download.path)).size;

    succeeded = true;
    recordTask(input.slug, true, Date.now() - started, inputSize);
    return {
      jobId: job.id,
      fileName: download.name,
      size,
      inputSize,
      count: outputs.length,
      downloadUrl: `/api/download/${job.id}/${encodeURIComponent(download.name)}`,
      continuable: outputs.length === 1 && download.name.toLowerCase().endsWith(".pdf"),
    };
  } catch (e) {
    recordTask(input.slug, false, Date.now() - started, inputSize);
    if (e instanceof TaskError) throw e;
    if (e instanceof ToolError) throw new TaskError(400, e.template, e.vars);
    if (e instanceof EngineMissingError || e instanceof BusyError) throw new TaskError(503, e.message);
    logError(`task:${input.slug}`, "Processing failed", e);
    throw new TaskError(500, "Something went wrong while processing your files. Please try again.");
  } finally {
    // Failed jobs leave nothing behind; successful ones expire after an hour.
    if (!succeeded) await deleteJob(job.id);
  }
}

async function runTool(
  slug: string,
  job: Job,
  inputs: JobFile[],
  opts: Record<string, string>,
  extras: Record<string, JobFile>,
): Promise<Output[]> {
  if (slug === "html-to-pdf") {
    const { bytes, host } = await htmlToPdf(opts.url ?? "", {
      pageSize: opts.pageSize,
      orientation: opts.orientation,
      margin: opts.margin,
      screenWidth: opts.screenWidth,
      onePage: opts.onePage === "true",
    });
    const name = `${host.replace(/[^a-z0-9.-]/gi, "_")}.pdf`;
    await writeFile(path.join(job.outDir, name), bytes);
    return [{ path: path.join(job.outDir, name), name }];
  }
  if (slug === "create-workflow") return runWorkflow(job, inputs, opts.steps);
  const processor = PROCESSORS[slug];
  if (!processor) throw new ToolError("This tool runs in your browser and has nothing to upload.");
  return processor({ job, inputs, opts, extras });
}

type Step = { tool: string; options: Record<string, unknown> };

async function runWorkflow(job: Job, inputs: JobFile[], rawSteps: string | undefined): Promise<Output[]> {
  let steps: Step[];
  try {
    steps = JSON.parse(rawSteps ?? "[]");
  } catch {
    throw new ToolError("The workflow could not be read.");
  }
  if (!Array.isArray(steps) || !steps.length) throw new ToolError("Add at least one tool to your workflow.");
  if (steps.length > 10) throw new ToolError("A workflow can have at most 10 steps.");
  let current: JobFile[] = inputs;
  for (const [i, step] of steps.entries()) {
    if (!(WORKFLOW_STEPS as readonly string[]).includes(step.tool)) {
      throw new ToolError('"{tool}" cannot be used in a workflow.', { tool: String(step.tool) });
    }
    const outDir = path.join(job.dir, `step${i + 1}`);
    await mkdir(outDir, { recursive: true });
    const opts = asStrings(step.options ?? {});
    if (step.tool === "rotate-pdf") {
      // A workflow rotates every page of every file by the chosen angle.
      const angle = Number(opts.angle) || 90;
      opts.rotations = JSON.stringify(Object.fromEntries(current.map((_, k) => [k, { all: angle }])));
    }
    if (step.tool === "add-watermark") opts.kind = "text";
    const stepCtx: Ctx = { job: { ...job, outDir }, inputs: current, opts, extras: {} };
    const results = await PROCESSORS[step.tool](stepCtx);
    current = results.map((r) => ({ path: r.path, name: r.name }));
  }
  // Give the final files clean names: original name + _workify.
  const finals: Output[] = [];
  for (const [i, f] of current.entries()) {
    const name = `${inputs[i]?.name.replace(/\.pdf$/i, "") ?? "file"}_workify.pdf`;
    await copyFile(f.path, path.join(job.outDir, name));
    finals.push({ path: path.join(job.outDir, name), name });
  }
  return finals;
}
