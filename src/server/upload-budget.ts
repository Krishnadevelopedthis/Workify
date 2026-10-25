import os from "node:os";
import { clientBucket, clientIp } from "@/server/rate-limit";
import { LIMITS } from "@/server/run-task";

/** Largest body one upload request may declare: the file limit plus room for multipart framing and options. */
export const MAX_REQUEST_BYTES = LIMITS.maxTotal + 10 * 1024 * 1024;

/**
 * Bytes all in-flight uploads may hold in memory together. request.formData()
 * buffers the whole body, and the heavy-job gate only starts after that, so
 * without this cap any number of large uploads could sit in RAM at once.
 * Defaults to a quarter of the memory available to the process, capped at 1 GB,
 * and never less than one maximum-size request (so a single upload always fits).
 * WORKIFY_UPLOAD_BUDGET_MB overrides it.
 */
export function defaultBudget() {
  const configured = Number(process.env.WORKIFY_UPLOAD_BUDGET_MB);
  if (configured > 0) return Math.max(MAX_REQUEST_BYTES, configured * 1024 * 1024);
  const memory = process.constrainedMemory?.() || os.totalmem();
  return Math.max(MAX_REQUEST_BYTES, Math.min(1024 * 1024 * 1024, Math.floor(memory / 4)));
}

/**
 * The declared body size, or null when the request has no usable Content-Length.
 * Chunked requests carry no length, so they could stream an unbounded body
 * into request.formData(); they are refused instead. Node's HTTP parser stops
 * reading the body at the declared Content-Length, so the value is a real cap.
 */
export function declaredLength(headers: Headers): number | null {
  if (headers.has("transfer-encoding")) return null;
  const raw = headers.get("content-length");
  if (raw === null || !/^\d{1,15}$/.test(raw.trim())) return null;
  return Number(raw.trim());
}

/** Why reading an upload body was abandoned. */
export class UploadAbort extends Error {
  constructor(readonly reason: "busy" | "idle" | "deadline" | "too-large") {
    super(`Upload aborted: ${reason}`);
  }
}

/** Bytes one request holds in an UploadBudget. It starts empty and grows as body bytes arrive. */
export interface UploadHold {
  /** Holds `bytes` more; false (holding nothing more) when the budget or the client's share is full. */
  take(bytes: number): boolean;
  /** Frees everything this hold took. Safe to call more than once. */
  release(): void;
  readonly held: number;
}

/**
 * A byte budget shared by every upload request in this process. Requests hold
 * only the bytes that have actually arrived (not their declared Content-Length),
 * so idle or slow connections cannot lock the budget, and one client (keyed by
 * address) can hold at most `perClient` bytes.
 */
export class UploadBudget {
  private used = 0;
  private readonly clients = new Map<string, number>();
  constructor(
    readonly limit: number,
    readonly perClient = limit,
  ) {}

  /**
   * Opens a hold for a request that declared `declared` bytes, or null when the
   * budget (or this client's share) cannot fit that many right now. `client` ""
   * means no usable client key: only the global limit applies.
   */
  open(declared: number, client = ""): UploadHold | null {
    if (declared > this.limit - this.used) return null;
    if (client && declared > this.perClient - (this.clients.get(client) ?? 0)) return null;
    let held = 0;
    let released = false;
    return {
      take: (bytes) => {
        if (released) return false;
        if (this.used + bytes > this.limit) return false;
        const mine = client ? (this.clients.get(client) ?? 0) : 0;
        if (client && mine + bytes > this.perClient) return false;
        this.used += bytes;
        if (client) this.clients.set(client, mine + bytes);
        held += bytes;
        return true;
      },
      release: () => {
        if (released) return;
        released = true;
        this.used -= held;
        if (client) {
          const left = (this.clients.get(client) ?? 0) - held;
          if (left > 0) this.clients.set(client, left);
          else this.clients.delete(client);
        }
      },
      get held() {
        return held;
      },
    };
  }

  /** Reserves `bytes` up front; returns a release function, or null when they do not fit. */
  reserve(bytes: number, client = ""): (() => void) | null {
    const hold = this.open(bytes, client);
    if (!hold || !hold.take(bytes)) return null;
    return hold.release;
  }

  get inUse() {
    return this.used;
  }
}

/**
 * The budget key for a request's client, or "" when there is none: without a
 * reverse proxy every request looks like "local", and a shared per-client cap
 * would then just shrink the global budget.
 */
export function uploadClient(headers: Headers) {
  const ip = clientIp(headers);
  return ip === "local" || ip === "unknown" ? "" : clientBucket(ip);
}

/** No body bytes for this long abandons the upload. */
export const UPLOAD_IDLE_MS = 30_000;
/** The whole body must arrive within this long. */
export const UPLOAD_DEADLINE_MS = 10 * 60_000;

/**
 * request.formData(), but every arriving chunk is taken from `hold` first, and
 * reading stops (rejecting with UploadAbort) when the budget is full, no bytes
 * arrive for `idleMs`, or the body takes longer than `deadlineMs`. The caller
 * releases the hold when it is done with the form.
 */
export async function readUploadForm(
  request: Request,
  hold: UploadHold,
  { idleMs = UPLOAD_IDLE_MS, deadlineMs = UPLOAD_DEADLINE_MS }: { idleMs?: number; deadlineMs?: number } = {},
): Promise<FormData> {
  if (!request.body) return request.formData();
  const reader = request.body.getReader();
  const declared = declaredLength(request.headers);
  let failure: UploadAbort | null = null;
  let received = 0;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let controller!: ReadableStreamDefaultController<Uint8Array>;

  const abort = (reason: UploadAbort["reason"]) => {
    if (failure) return;
    failure = new UploadAbort(reason);
    clearTimeout(idleTimer);
    clearTimeout(deadline);
    try {
      controller.error(failure);
    } catch {
      // already closed
    }
    reader.cancel(failure).catch(() => {});
  };
  const armIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => abort("idle"), idleMs);
  };
  const deadline = setTimeout(() => abort("deadline"), deadlineMs);
  armIdle();

  const metered = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    async pull(c) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (e) {
        if (!failure) c.error(e);
        return;
      }
      if (failure) return;
      if (chunk.done) {
        clearTimeout(idleTimer);
        clearTimeout(deadline);
        c.close();
        return;
      }
      received += chunk.value.byteLength;
      if (declared !== null && received > declared) return abort("too-large");
      if (!hold.take(chunk.value.byteLength)) return abort("busy");
      armIdle();
      c.enqueue(chunk.value);
    },
    cancel(reason) {
      clearTimeout(idleTimer);
      clearTimeout(deadline);
      return reader.cancel(reason);
    },
  });

  try {
    return await new Response(metered, {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
  } catch (e) {
    throw failure ?? e;
  } finally {
    clearTimeout(idleTimer);
    clearTimeout(deadline);
  }
}

const g = globalThis as unknown as { workifyUploadBudget?: UploadBudget };
// A dev-server reload may leave an instance of an older version of the class.
if (typeof g.workifyUploadBudget?.open !== "function") delete g.workifyUploadBudget;
/** One client may hold at most one maximum-size upload at a time. */
export const uploadBudget = (g.workifyUploadBudget ??= new UploadBudget(defaultBudget(), MAX_REQUEST_BYTES));
