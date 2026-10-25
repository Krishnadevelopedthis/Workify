import { describe, expect, it } from "vitest";
import { declaredLength, MAX_REQUEST_BYTES, readUploadForm, UploadBudget, defaultBudget } from "./upload-budget";

describe("declaredLength", () => {
  it("reads a plain Content-Length", () => {
    expect(declaredLength(new Headers({ "content-length": "1234" }))).toBe(1234);
    expect(declaredLength(new Headers({ "content-length": "0" }))).toBe(0);
  });

  it("refuses requests without a usable length", () => {
    expect(declaredLength(new Headers())).toBeNull();
    expect(declaredLength(new Headers({ "transfer-encoding": "chunked" }))).toBeNull();
    expect(declaredLength(new Headers({ "content-length": "10", "transfer-encoding": "chunked" }))).toBeNull();
    for (const bad of ["-1", "1e9", "abc", "12.5", "", "9999999999999999"]) {
      expect(declaredLength(new Headers({ "content-length": bad }))).toBeNull();
    }
  });
});

describe("UploadBudget", () => {
  it("refuses reservations past the limit and frees them on release", () => {
    const budget = new UploadBudget(100);
    const a = budget.reserve(60);
    expect(a).not.toBeNull();
    expect(budget.reserve(50)).toBeNull();
    const b = budget.reserve(40);
    expect(b).not.toBeNull();
    expect(budget.inUse).toBe(100);
    a!();
    a!(); // releasing twice frees the bytes only once
    expect(budget.inUse).toBe(40);
    expect(budget.reserve(60)).not.toBeNull();
    expect(budget.reserve(101)).toBeNull();
  });

  it("always fits at least one maximum-size request", () => {
    const before = process.env.WORKIFY_UPLOAD_BUDGET_MB;
    try {
      process.env.WORKIFY_UPLOAD_BUDGET_MB = "1";
      expect(defaultBudget()).toBe(MAX_REQUEST_BYTES);
      delete process.env.WORKIFY_UPLOAD_BUDGET_MB;
      expect(defaultBudget()).toBeGreaterThanOrEqual(MAX_REQUEST_BYTES);
      expect(defaultBudget()).toBeLessThanOrEqual(Math.max(MAX_REQUEST_BYTES, 1024 * 1024 * 1024));
    } finally {
      if (before === undefined) delete process.env.WORKIFY_UPLOAD_BUDGET_MB;
      else process.env.WORKIFY_UPLOAD_BUDGET_MB = before;
    }
  });
});

/** A multipart request whose body is fed by hand, so a test can stall it. */
function stalledUpload(declared: number) {
  let push!: (chunk: Uint8Array) => void;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      push = (chunk) => c.enqueue(chunk);
    },
  });
  const request = new Request("http://x/api/process/merge", {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=b", "content-length": String(declared) },
    body,
    duplex: "half",
  } as RequestInit);
  return { request, push };
}

describe("R2-1: slow uploads cannot lock the shared budget", () => {
  // BUG(R2-1): the whole declared Content-Length was reserved before any body
  // byte arrived, so a few idle connections returned 503 to every other user.
  it("holds only the bytes that actually arrived", async () => {
    const budget = new UploadBudget(1000, 600);
    const hold = budget.open(600, "attacker");
    expect(hold).not.toBeNull();
    expect(budget.inUse).toBe(0); // headers only: nothing held yet
    // Another client can still upload while the first one sends nothing.
    expect(budget.open(600, "someone-else")).not.toBeNull();
    expect(hold!.take(100)).toBe(true);
    expect(budget.inUse).toBe(100);
    hold!.release();
    expect(budget.inUse).toBe(0);
  });

  // BUG(R2-1): one client could hold the whole budget by itself.
  it("caps what one client can hold", () => {
    const budget = new UploadBudget(1000, 600);
    const a = budget.open(500, "1.2.3.4")!;
    expect(a.take(500)).toBe(true);
    expect(budget.open(200, "1.2.3.4")).toBeNull(); // over that client's share
    const b = budget.open(200, "5.6.7.8")!;
    expect(b.take(200)).toBe(true);
    const c = budget.open(100, "1.2.3.4")!;
    expect(c.take(100)).toBe(true);
    expect(c.take(1)).toBe(false); // the client's share is used up
    a.release();
    b.release();
    c.release();
    expect(budget.inUse).toBe(0);
  });

  // BUG(R2-1): a connection that stopped sending held its reservation until
  // Node's 300 s request timeout.
  it("gives up on an upload that stops sending and frees its bytes", async () => {
    const budget = new UploadBudget(1000, 1000);
    const { request, push } = stalledUpload(900);
    const hold = budget.open(900, "slow")!;
    const form = readUploadForm(request, hold, { idleMs: 50, deadlineMs: 10_000 });
    push(new TextEncoder().encode("--b\r\n"));
    await expect(form).rejects.toMatchObject({ reason: "idle" });
    hold.release();
    expect(budget.inUse).toBe(0);
  });

  it("gives up on an upload that trickles past the deadline", async () => {
    const budget = new UploadBudget(1000, 1000);
    const { request, push } = stalledUpload(900);
    const hold = budget.open(900, "slow")!;
    const form = readUploadForm(request, hold, { idleMs: 1000, deadlineMs: 120 });
    const drip = setInterval(() => push(new Uint8Array([45])), 20);
    try {
      await expect(form).rejects.toMatchObject({ reason: "deadline" });
    } finally {
      clearInterval(drip);
    }
  });

  it("refuses with 'busy' when the arriving bytes do not fit", async () => {
    const budget = new UploadBudget(100, 100);
    const other = budget.open(60, "other")!;
    expect(other.take(60)).toBe(true);
    const { request, push } = stalledUpload(50);
    const hold = budget.open(40, "late")!;
    const form = readUploadForm(request, hold, { idleMs: 1000, deadlineMs: 1000 });
    push(new Uint8Array(50));
    await expect(form).rejects.toMatchObject({ reason: "busy" });
    hold.release();
    expect(budget.inUse).toBe(60);
  });

  it("reads a normal multipart upload and holds its bytes", async () => {
    const budget = new UploadBudget(10_000, 10_000);
    const fd = new FormData();
    fd.set("options", "{}");
    fd.set("files", new File(["hello"], "a.txt"));
    const encoded = new Request("http://x", { method: "POST", body: fd });
    const bytes = new Uint8Array(await encoded.arrayBuffer());
    const request = new Request("http://x", {
      method: "POST",
      headers: { "content-type": encoded.headers.get("content-type")!, "content-length": String(bytes.length) },
      body: bytes,
    });
    const hold = budget.open(bytes.length, "")!;
    const form = await readUploadForm(request, hold);
    expect(form.get("options")).toBe("{}");
    expect(await (form.get("files") as File).text()).toBe("hello");
    expect(budget.inUse).toBe(bytes.length);
    hold.release();
    expect(budget.inUse).toBe(0);
  });
});
