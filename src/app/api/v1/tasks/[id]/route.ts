import { ApiError, authenticate, taskJson, taskOf } from "@/server/api";
import { handle, json } from "../../_lib";

export const runtime = "nodejs";

/** Status (and result) of a background task. */
export async function GET(request: Request, ctx: RouteContext<"/api/v1/tasks/[id]">) {
  return handle(async () => {
    const user = authenticate(request);
    const task = taskOf(user.id, (await ctx.params).id);
    if (!task) throw new ApiError(404, "Task not found. Tasks are kept for 7 days.");
    return json(taskJson(task));
  });
}
