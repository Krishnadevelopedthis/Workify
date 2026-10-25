"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useLang } from "@/i18n/client";

const SESSION_KEY = "wf_seen";

function device(): string {
  if (window.matchMedia("(pointer: coarse)").matches) {
    return window.matchMedia("(min-width: 768px)").matches ? "tablet" : "mobile";
  }
  return "desktop";
}

/**
 * Counts one page view. The server keeps daily totals only (no cookies, no IP
 * address, no row per visit), so nothing here identifies a visitor.
 */
export function PageView() {
  const pathname = usePathname();
  const lang = useLang();

  useEffect(() => {
    let first = false;
    try {
      first = !sessionStorage.getItem(SESSION_KEY);
      if (first) sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // Private windows can refuse storage; the view still counts.
    }
    const body = JSON.stringify({ path: pathname, lang, device: device(), referrer: document.referrer, first });
    // keepalive so the request survives the visitor leaving straight away.
    fetch("/api/views", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
  }, [pathname, lang]);

  return null;
}
