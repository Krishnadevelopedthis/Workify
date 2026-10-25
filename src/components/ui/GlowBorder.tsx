// Adapted from Vengeance UI glow-border-card (MIT); see THIRD_PARTY_NOTICES.md.
import type { ReactNode } from "react";

/** Animated brand-to-accent border frame (CSS only, see .wf-glow in globals.css). Static under reduced motion. */
export function GlowBorder({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`wf-glow flex rounded-2xl p-[1.5px] ${className ?? ""}`}>{children}</div>;
}
