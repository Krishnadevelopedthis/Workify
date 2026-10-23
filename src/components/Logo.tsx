import { HoverLink } from "./HoverLink";

/** Workify wordmark: a folded-page mark plus "Worki" + accent-colored "fy". */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <HoverLink href="/" className={`flex items-center gap-2 ${className}`} aria-label="Workify">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M6 3h14l7 7v17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="var(--brand)" />
        <path d="M20 3v5a2 2 0 0 0 2 2h5z" fill="var(--accent)" />
        <path d="M9 17l3 6 4-8 4 8 3-6" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-2xl font-extrabold tracking-tight text-ink" dir="ltr">
        Worki<span className="text-accent">fy</span>
      </span>
    </HoverLink>
  );
}
