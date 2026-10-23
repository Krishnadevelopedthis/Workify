import { TOOLS, workflowStepOptions } from "@/lib/tools";
import { authenticate } from "@/server/api";
import { PROCESSORS } from "@/server/processors";
import { handle, json } from "../_lib";

export const runtime = "nodejs";

const API_TOOLS = TOOLS.filter((t) => !t.unavailable && (PROCESSORS[t.slug] || t.slug === "html-to-pdf" || t.slug === "create-workflow"));

/** Every tool the API can run, with its options. */
export async function GET(request: Request) {
  return handle(async () => {
    authenticate(request);
    return json({
      tools: API_TOOLS.map((t) => ({
        slug: t.slug,
        name: t.name,
        description: t.description,
        accepts: t.accept || null,
        multiple_files: t.multiple,
        options: (t.editor ? workflowStepOptions(t.slug) : (t.options ?? [])).map((o) => {
          const out: Record<string, unknown> = { key: o.key, type: o.type, label: o.label };
          if ("default" in o) out.default = o.default;
          if ("choices" in o) out.choices = o.choices.map((c) => c.value);
          return out;
        }),
      })),
    });
  });
}
