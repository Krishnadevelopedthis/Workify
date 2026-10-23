import type { Tool, ToolOption } from "@/lib/tools";
import type { T } from "./translate";

/** Placeholders such as "1, 3-5" are not words and stay as they are. */
const words = (s: string, t: T) => (/[a-z]/i.test(s) ? t(s) : s);

export function localizeOption(o: ToolOption, t: T): ToolOption {
  const out = { ...o, label: t(o.label) } as ToolOption;
  if ("choices" in out) {
    out.choices = out.choices.map((c) => ({ ...c, label: words(c.label, t), ...("hint" in c && c.hint ? { hint: t(c.hint) } : {}) }));
  }
  if (out.type === "text" || out.type === "password") {
    if (out.placeholder) out.placeholder = words(out.placeholder, t);
    if (out.hint) out.hint = t(out.hint);
  }
  return out;
}

/** The tool with every visible text in the current language (slugs, keys and values unchanged). */
export function localizeTool(tool: Tool, t: T): Tool {
  return {
    ...tool,
    name: t(tool.name),
    description: t(tool.description),
    title: t(tool.title),
    subtitle: t(tool.subtitle),
    acceptLabel: tool.acceptLabel && t(tool.acceptLabel),
    action: t(tool.action),
    unavailable: tool.unavailable && t(tool.unavailable),
    options: tool.options?.map((o) => localizeOption(o, t)),
  };
}
