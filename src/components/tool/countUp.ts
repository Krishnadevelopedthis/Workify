// Adapted from Vengeance UI stats-counter (MIT); see THIRD_PARTY_NOTICES.md. Rewritten with requestAnimationFrame.
"use client";

import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/motion";

/** The value shown `elapsedMs` into a count from 0 to `target`, eased out (cubic). */
export function countUpValue(target: number, elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0 || elapsedMs >= durationMs) return target;
  if (elapsedMs <= 0) return 0;
  const p = elapsedMs / durationMs;
  const eased = 1 - (1 - p) ** 3;
  const v = Math.round(target * eased);
  return target >= 0 ? Math.min(v, target) : Math.max(v, target);
}

/** Animates once from 0 to `target`; returns `target` straight away with reduced motion. */
export function useCountUp(target: number, duration = 900): number {
  const reduced = usePrefersReducedMotion();
  const skip = reduced || target === 0;
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (skip) return;
    let raf = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const elapsed = now - start;
      setValue(countUpValue(target, elapsed, duration));
      if (elapsed < duration) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, skip]);

  return skip ? target : value;
}
