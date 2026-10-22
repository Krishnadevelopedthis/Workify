import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const JOBS_ROOT = path.join(os.tmpdir(), "workify-jobs");
const MAX_AGE_MS = 60 * 60 * 1000; // results are deleted after one hour

export type JobFile = { path: string; name: string };

export type Job = { id: string; dir: string; inDir: string; outDir: string };

const ID_RE = /^[0-9a-f-]{36}$/;

/** Strips anything that could escape a folder or break a filename. */
export function safeName(name: string) {
  const base = path.basename(name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim();
  return base.slice(-150) || "file";
}

export async function createJob(): Promise<Job> {
  void sweepOldJobs();
  const id = randomUUID();
  const dir = path.join(JOBS_ROOT, id);
  const inDir = path.join(dir, "in");
  const outDir = path.join(dir, "out");
  await mkdir(inDir, { recursive: true });
  await mkdir(outDir, { recursive: true });
  return { id, dir, inDir, outDir };
}

export async function saveUpload(job: Job, file: File, index: number): Promise<JobFile> {
  const name = safeName(file.name);
  // Prefix with the index so two uploads with the same name never collide.
  const p = path.join(job.inDir, `${String(index).padStart(3, "0")}_${name}`);
  await writeFile(p, Buffer.from(await file.arrayBuffer()));
  return { path: p, name };
}

export function jobDir(id: string) {
  if (!ID_RE.test(id)) return null;
  return path.join(JOBS_ROOT, id);
}

export async function deleteJob(id: string) {
  const dir = jobDir(id);
  if (dir) await rm(dir, { recursive: true, force: true });
}

async function sweepOldJobs() {
  try {
    const now = Date.now();
    for (const id of await readdir(JOBS_ROOT)) {
      const dir = path.join(JOBS_ROOT, id);
      const s = await stat(dir);
      if (now - s.mtimeMs > MAX_AGE_MS) await rm(dir, { recursive: true, force: true });
    }
  } catch {
    // The sweep is best-effort; a failure must never block a new job.
  }
}
