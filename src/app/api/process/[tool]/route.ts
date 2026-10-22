import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { TOOL_BY_SLUG, WORKFLOW_STEPS } from "@/lib/tools";
import { EngineMissingError, ToolError } from "@/server/engines";
import { htmlToPdf } from "@/server/html-to-pdf";
import { createJob, deleteJob, saveUpload, type Job, type JobFile } from "@/server/jobs";
import { PROCESSORS, type Ctx, type Output } from "@/server/processors";
import { BusyError, heavyGate, rateLimit, tooMany } from "@/server/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 900;

const MAX_FILE = 200 * 1024 * 1024;
const MAX_TOTAL = 500 * 1024 * 1024;
const MAX_FILES = 100;
const MAX_EXTRAS = 10;

const fail = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(request: Request, ctx: RouteContext<"/api/process/[tool]">) {
  const { tool: slug } = await ctx.params;
  const tool = TOOL_BY_SLUG.get(slug);
  if (!tool) return fail(404, "Unknown tool.");
  if (tool.unavailable) return fail(503, tool.unavailable);

  // Refuse oversized uploads before buffering the body into memory.
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_TOTAL + 10 * 1024 * 1024) return fail(413, "All files together can be at most 500 MB.");
  const limited = rateLimit("process", request.headers);
  if (limited) return tooMany(limited);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "The upload could not be read. Try again.");
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length > MAX_FILES) return fail(400, `You can process at most ${MAX_FILES} files at once.`);
  const total = files.reduce((s, f) => s + f.size, 0);
  if (files.some((f) => f.size > MAX_FILE)) return fail(413, "Each file can be at most 200 MB.");
  if (total > MAX_TOTAL) return fail(413, "All files together can be at most 500 MB.");
  if (slug !== "html-to-pdf" && files.length === 0) return fail(400, "Select at least one file.");
  if (!tool.multiple && files.length > 1 && slug !== "html-to-pdf") return fail(400, "This tool works on one file at a time.");

  let opts: Record<string, string> = {};
  try {
    const parsed = JSON.parse(String(form.get("options") ?? "{}")) as Record<string, unknown>;
    opts = Object.fromEntries(
      Object.entries(parsed).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]),
    );
  } catch {
    return fail(400, "The tool settings could not be read.");
  }

  const job = await createJob();
  let succeeded = false;
  try {
    const inputs: JobFile[] = [];
    for (const [i, f] of files.entries()) inputs.push(await saveUpload(job, f, i));
    const extras: Record<string, JobFile> = {};
    let n = 1000;
    for (const [key, value] of form.entries()) {
      if (n >= 1000 + MAX_EXTRAS) break;
      if (key.startsWith("extra:") && /^extra:[\w-]{1,40}$/.test(key) && value instanceof File && value.size <= 20 * 1024 * 1024) {
        extras[key.slice(6)] = await saveUpload(job, value, n++);
      }
    }

    const outputs = await heavyGate.run(() => runTool(slug, job, inputs, opts, extras));
    if (!outputs.length) return fail(500, "The tool produced no files.");

    const inputBytes = total;
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
        zip.file(name, await readFile(o.path));
      }
      const zipName = `workify_${slug}.zip`;
      const zipPath = path.join(job.dir, zipName);
      await writeFile(zipPath, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
      download = { path: zipPath, name: zipName };
    }
    const finalDir = path.join(job.dir, "download");
    await mkdir(finalDir, { recursive: true });
    await copyFile(download.path, path.join(finalDir, download.name));
    // The path is always inside the OS temp folder, never project files.
    const outSize = (await stat(/*turbopackIgnore: true*/ download.path)).size;

    succeeded = true;
    return Response.json({
      jobId: job.id,
      fileName: download.name,
      size: outSize,
      inputSize: inputBytes,
      count: outputs.length,
      downloadUrl: `/api/download/${job.id}/${encodeURIComponent(download.name)}`,
      // The single PDF result can be handed to another tool.
      continuable: outputs.length === 1 && download.name.toLowerCase().endsWith(".pdf"),
    });
  } catch (e) {
    if (e instanceof ToolError) return fail(400, e.message);
    if (e instanceof EngineMissingError || e instanceof BusyError) return fail(503, e.message);
    console.error(`[${slug}]`, e);
    return fail(500, "Something went wrong while processing your files. Please try again.");
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
      throw new ToolError(`"${step.tool}" cannot be used in a workflow.`);
    }
    const outDir = path.join(job.dir, `step${i + 1}`);
    await mkdir(outDir, { recursive: true });
    const opts = Object.fromEntries(
      Object.entries(step.options ?? {}).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]),
    );
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
