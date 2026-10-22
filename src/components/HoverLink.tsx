"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";

/**
 * A Link that prefetches only when the user shows intent (hover, focus, touch)
 * instead of for every link that scrolls into view. Used for big link grids,
 * where viewport prefetching would fire dozens of requests on page load.
 */
export function HoverLink({ href, ...props }: ComponentProps<typeof Link> & { href: string }) {
  const router = useRouter();
  const warm = () => router.prefetch(href);
  return <Link href={href} prefetch={false} onMouseEnter={warm} onFocus={warm} onTouchStart={warm} {...props} />;
}
