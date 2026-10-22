import type { Tool } from "@/lib/tools";
import { Icon } from "./Icon";

/** Colored tile with the tool's icon, plus a format letter for Office conversions. */
export function ToolIcon({ tool, size = 44 }: { tool: Pick<Tool, "icon" | "color" | "badge">; size?: number }) {
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center rounded-lg text-white"
      style={{ width: size, height: size, background: tool.color }}
    >
      <Icon name={tool.icon} size={size * 0.58} />
      {tool.badge && (
        <span
          className="absolute -right-1.5 -bottom-1.5 flex items-center justify-center rounded-md border-2 border-white font-bold"
          style={{ width: size * 0.48, height: size * 0.48, fontSize: size * 0.26, background: tool.color }}
        >
          {tool.badge}
        </span>
      )}
    </span>
  );
}
