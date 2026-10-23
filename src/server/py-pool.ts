import "server-only";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import { createInterface } from "node:readline";

// A small pool of long-lived `workify_tools.py serve` processes. Importing
// PyMuPDF & co. takes ~5 s, so paying it once per worker (not per request)
// is the single biggest speed-up for the Python-backed tools.

type Result = Record<string, unknown>;
type Job = { cmd: string; args: string[]; timeoutMs: number; resolve: (r: Result) => void; reject: (e: Error) => void };

const RECYCLE_AFTER = 100; // restart a worker after this many jobs to cap memory growth
const SCRIPT = path.join(/* turbopackIgnore: true */ process.cwd(), "py", "workify_tools.py");

class Worker {
  private proc: ChildProcessWithoutNullStreams;
  private ready: Promise<void>;
  private waiting: ((line: string) => void) | null = null;
  private seq = 0;
  jobs = 0;
  busy = false;
  dead = false;

  constructor(python: string, env: NodeJS.ProcessEnv) {
    this.proc = spawn(python, ["-I", SCRIPT, "serve"], { env, windowsHide: true });
    this.proc.stderr.on("data", () => {}); // library chatter; drained so the pipe never blocks
    const lines = createInterface({ input: this.proc.stdout });
    let markReady!: () => void;
    this.ready = new Promise((r) => (markReady = r));
    lines.on("line", (line) => {
      if (line.startsWith('{"ready"')) return markReady();
      this.waiting?.(line);
    });
    this.proc.on("exit", () => {
      this.dead = true;
      markReady();
      this.waiting?.('{"result":{"error":"The conversion engine stopped unexpectedly. Please try again."}}');
    });
  }

  async run(job: Job): Promise<Result> {
    await this.ready;
    if (this.dead) throw new Error("worker exited");
    const id = ++this.seq;
    this.jobs++;
    return new Promise<Result>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting = null;
        this.kill();
        reject(new Error("timed out"));
      }, job.timeoutMs);
      this.waiting = (line) => {
        let msg: { id?: number; result?: Result };
        try {
          msg = JSON.parse(line);
        } catch {
          return; // not a protocol line
        }
        if (msg.id !== undefined && msg.id !== id) return;
        clearTimeout(timer);
        this.waiting = null;
        resolve(msg.result ?? { error: "Empty response from the conversion engine." });
      };
      this.proc.stdin.write(JSON.stringify({ id, cmd: job.cmd, args: job.args }) + "\n");
    });
  }

  kill() {
    this.dead = true;
    this.proc.kill();
  }
}

class Pool {
  private workers: Worker[] = [];
  private queue: Job[] = [];

  constructor(
    private python: string,
    private env: NodeJS.ProcessEnv,
    private size: number,
  ) {}

  run(cmd: string, args: string[], timeoutMs: number) {
    return new Promise<Result>((resolve, reject) => {
      this.queue.push({ cmd, args, timeoutMs, resolve, reject });
      this.pump();
    });
  }

  private pump() {
    this.workers = this.workers.filter((w) => !w.dead);
    while (this.queue.length) {
      let w = this.workers.find((x) => !x.busy);
      if (!w && this.workers.length < this.size) {
        w = new Worker(this.python, this.env);
        this.workers.push(w);
      }
      if (!w) return; // all busy; pump() runs again when one finishes
      const job = this.queue.shift()!;
      w.busy = true;
      const worker = w;
      worker
        .run(job)
        .then(job.resolve, job.reject)
        .finally(() => {
          worker.busy = false;
          if (worker.jobs >= RECYCLE_AFTER) worker.kill();
          this.pump();
        });
    }
  }

  shutdown() {
    this.workers.forEach((w) => w.kill());
  }
}

const g = globalThis as unknown as { workifyPyPool?: Pool };

export function pyPool(python: string, env: NodeJS.ProcessEnv) {
  if (!g.workifyPyPool) {
    const size = Math.max(1, Number(process.env.WORKIFY_PY_WORKERS) || 2);
    g.workifyPyPool = new Pool(python, env, size);
    // Do not leave orphaned Python processes behind when the server stops.
    process.once("exit", () => g.workifyPyPool?.shutdown());
  }
  return g.workifyPyPool;
}
