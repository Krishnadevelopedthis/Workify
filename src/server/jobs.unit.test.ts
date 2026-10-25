import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createJob, deleteJob, jobDir, JOBS_ROOT, safeName, saveUpload, type Job } from "./jobs";

describe("safeName", () => {
  it("keeps ordinary names unchanged", () => {
    expect(safeName("report.pdf")).toBe("report.pdf");
    expect(safeName("My Report (final) v2.pdf")).toBe("My Report (final) v2.pdf");
  });

  it("drops directories, so a name can never leave the job folder", () => {
    for (const n of ["../../etc/passwd", "/etc/passwd", "a/b/c.pdf", "..\\..\\win.ini", "C:\\Windows\\win.ini"]) {
      const s = safeName(n);
      expect(s, n).not.toMatch(/[\\/]/);
      expect(path.join("/jobs/in", `000_${s}`).startsWith(path.join("/jobs/in"))).toBe(true);
    }
    expect(safeName("../../etc/passwd")).toBe("passwd");
  });

  it("replaces characters Windows and shells refuse, and control characters", () => {
    expect(safeName('a<b>c:d"e|f?g*h.pdf')).toBe("a_b_c_d_e_f_g_h.pdf");
    expect(safeName("tab\there\nnew\u0000null.pdf")).toBe("tab_here_new_null.pdf");
  });

  it("falls back to 'file' for empty or blank names", () => {
    expect(safeName("")).toBe("file");
    expect(safeName("   ")).toBe("file");
    expect(safeName("/")).toBe("file");
  });

  it("keeps unicode names", () => {
    expect(safeName("रिपोर्ट.pdf")).toBe("रिपोर्ट.pdf");
    expect(safeName("報告書 2026.pdf")).toBe("報告書 2026.pdf");
    expect(safeName("😀.pdf")).toBe("😀.pdf");
  });

  it("keeps the end of very long names, so the extension survives", () => {
    const s = safeName(`${"a".repeat(400)}.pdf`);
    expect(s).toHaveLength(150);
    expect(s.endsWith(".pdf")).toBe(true);
  });

  // BUG(jobs-surrogate): expected a long emoji name to be cut on a character
  // boundary (well-formed UTF-16); actual: slice(-150) counts UTF-16 code units
  // and can leave a lone surrogate at the start, which becomes U+FFFD on disk
  // and in Content-Disposition headers.
  it("cuts long names on a character boundary", () => {
    const s = safeName(`${"😀".repeat(100)}x.pdf`); // 205 code units, odd cut point
    expect(s.isWellFormed()).toBe(true);
  });

  it("does not turn dot names into a path segment that means 'parent'", () => {
    // Saved files are always prefixed (000_..), so this is only about the display name.
    const s = safeName("..");
    expect(s).not.toMatch(/[\\/]/);
  });
});

describe("jobDir", () => {
  it("accepts job ids made by createJob", async () => {
    const job = await createJob();
    try {
      expect(jobDir(job.id)).toBe(job.dir);
    } finally {
      await deleteJob(job.id);
    }
  });

  it.each([
    "",
    "..",
    "../../etc",
    "test",
    "0123456789abcdef0123456789abcdef012", // 35 chars
    "0123456789abcdef0123456789abcdef01234", // 37 chars
    "0123456789ABCDEF0123456789ABCDEF0123", // upper case
    "01234567-89ab-cdef-0123-456789abcde/",
    "01234567-89ab-cdef-0123-456789abcdef\n",
    "01234567-89ab-cdef-0123-456789abc\\..",
  ])("rejects %j", (id) => {
    expect(jobDir(id)).toBeNull();
  });

  it("never resolves outside the jobs root", () => {
    const d = jobDir("01234567-89ab-cdef-0123-456789abcdef")!;
    expect(path.dirname(d)).toBe(JOBS_ROOT);
  });
});

describe("createJob / saveUpload / deleteJob", () => {
  let job: Job | null = null;
  afterEach(async () => {
    if (job) await deleteJob(job.id);
    job = null;
  });

  it("creates separate in and out folders under a fresh id", async () => {
    job = await createJob();
    expect(job.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(existsSync(job.inDir)).toBe(true);
    expect(existsSync(job.outDir)).toBe(true);
    expect(path.dirname(job.dir)).toBe(JOBS_ROOT);
    const other = await createJob();
    expect(other.id).not.toBe(job.id);
    await deleteJob(other.id);
  });

  it("prefixes uploads with their index so equal names never collide", async () => {
    job = await createJob();
    const a = await saveUpload(job, new File(["first"], "same.pdf"), 0);
    const b = await saveUpload(job, new File(["second"], "same.pdf"), 1);
    expect(a.name).toBe("same.pdf");
    expect(b.name).toBe("same.pdf");
    expect(path.basename(a.path)).toBe("000_same.pdf");
    expect(path.basename(b.path)).toBe("001_same.pdf");
    expect(await readFile(a.path, "utf8")).toBe("first");
    expect(await readFile(b.path, "utf8")).toBe("second");
  });

  it("keeps hostile names inside the job's input folder", async () => {
    job = await createJob();
    const f = await saveUpload(job, new File(["x"], "../../../evil.pdf"), 7);
    expect(path.dirname(f.path)).toBe(job.inDir);
    expect(f.name).toBe("evil.pdf");
    expect(await readdir(job.inDir)).toEqual(["007_evil.pdf"]);
  });

  it("stores empty uploads as empty files", async () => {
    job = await createJob();
    const f = await saveUpload(job, new File([], ""), 0);
    expect(f.name).toBe("file");
    expect((await readFile(f.path)).byteLength).toBe(0);
  });

  it("deletes a job's folder, and ignores invalid ids", async () => {
    job = await createJob();
    await deleteJob(job.id);
    expect(existsSync(job.dir)).toBe(false);
    await expect(deleteJob("../..")).resolves.toBeUndefined();
    await expect(deleteJob(job.id)).resolves.toBeUndefined(); // already gone
    expect(existsSync(JOBS_ROOT)).toBe(true);
    job = null;
  });
});
