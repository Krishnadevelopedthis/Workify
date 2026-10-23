"use client";

import NextLink from "next/link";
import type { ComponentProps } from "react";
import { useLocalePath } from "./client";

/** next/link that keeps the visitor in their language. */
export function Link({ href, ...props }: ComponentProps<typeof NextLink>) {
  const lp = useLocalePath();
  return <NextLink href={typeof href === "string" ? lp(href) : href} {...props} />;
}
