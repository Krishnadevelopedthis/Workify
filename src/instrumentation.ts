import type { Instrumentation } from "next";

// Uncaught server errors (rendering, route handlers, server actions) go to the
// admin panel's error log.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const message = err instanceof Error ? err.message : String(err);
  try {
    const { logError } = await import("./server/monitor");
    logError(`${context.routeType}:${context.routePath}`, `${request.method} ${request.path}: ${message}`, err);
  } catch {
    console.error("[onRequestError]", request.method, request.path, err);
  }
};
