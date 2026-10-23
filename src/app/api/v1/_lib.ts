import { ApiError, apiError } from "@/server/api";
import { TaskError } from "@/server/run-task";
import { logError } from "@/server/monitor";

/** Wraps an API handler: errors become JSON `{ error: { status, message } }`. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError) return apiError(e.status, e.message);
    if (e instanceof TaskError) return apiError(e.status, e.message);
    logError("api", "Unhandled API error", e);
    return apiError(500, "Internal error. Please try again.");
  }
}

export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
