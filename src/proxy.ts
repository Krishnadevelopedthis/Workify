import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, isLocale } from "./i18n/config";

// Every page lives under app/[lang]. English URLs carry no prefix, so they are
// rewritten to /en/...; a visible /en/... is redirected to the clean URL.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const first = pathname.split("/")[1];

  if (first === DEFAULT_LOCALE) {
    const clean = pathname.slice(DEFAULT_LOCALE.length + 1) || "/";
    return NextResponse.redirect(new URL(clean + search, request.url), 308);
  }
  if (isLocale(first)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/${DEFAULT_LOCALE}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Pages only: not the API, Next's own files, or files with an extension
  // (icons, the pdf.js worker, robots.txt, sitemap.xml, the web manifest).
  matcher: ["/((?!api/|_next/|.*\\.[a-z0-9]+$).*)"],
};
