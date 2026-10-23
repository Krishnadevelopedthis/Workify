"use client";

import { HoverLink } from "./HoverLink";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logout } from "@/app/actions/auth";
import { useLocalePath, useT } from "@/i18n/client";
import { ALL_TOOLS_MENU, CONVERT_MENU, TOOL_BY_SLUG } from "@/lib/tools";
import { Icon } from "./Icon";
import { Logo } from "./Logo";
import { ToolIcon } from "./ToolIcon";

type Menu = "convert" | "all" | "apps" | "user" | null;

const APPS = [
  { href: "/desktop", icon: "device-desktop", label: "Workify Desktop" },
  { href: "/mobile", icon: "device-mobile", label: "Workify Mobile" },
  { href: "/business", icon: "building", label: "Business" },
  { href: "/education", icon: "school", label: "Education" },
  { href: "/create-workflow", icon: "route", label: "Workflows" },
  { href: "/developers", icon: "code", label: "Developers" },
  { href: "/pricing", icon: "crown", label: "Pricing" },
];

function ToolLink({ slug, onClick }: { slug: string; onClick: () => void }) {
  const t = useT();
  const tool = TOOL_BY_SLUG.get(slug)!;
  return (
    <HoverLink
      href={`/${slug}`}
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-ink hover:bg-bg"
    >
      <ToolIcon tool={tool} size={22} />
      <span>{t(tool.name)}</span>
      {tool.unavailable && <span className="text-[10px] font-semibold text-muted">{t("SOON")}</span>}
    </HoverLink>
  );
}

type SessionUser = { name: string; email: string; admin?: boolean } | null;

export function Header() {
  const t = useT();
  const lp = useLocalePath();
  const [open, setOpen] = useState<Menu>(null);
  const [mobile, setMobile] = useState(false);
  // undefined = still loading (renders a fixed-size skeleton, so nothing shifts).
  const [user, setUser] = useState<SessionUser | undefined>(undefined);
  const ref = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const close = () => {
    setOpen(null);
    setMobile(false);
  };

  // Close menus after any navigation (including back/forward).
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    close();
  }

  // The layout is static (cacheable), so the signed-in user is fetched here.
  // Re-checked on navigation so login/logout redirects update the header.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/session", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ user: SessionUser }>)
      .then((d) => !cancelled && setUser(d.user))
      .catch(() => !cancelled && setUser(null));
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  async function signOut() {
    close();
    setUser(null);
    await logout();
    router.push(lp("/"));
    router.refresh();
  }

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const toggle = (m: Menu) => setOpen((cur) => (cur === m ? null : m));
  const navItem = "px-3 py-2 text-[13px] font-semibold tracking-wide text-ink uppercase hover:text-brand";

  return (
    <header ref={ref} className="sticky top-0 z-40 border-b border-line bg-white">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-4 px-4 lg:px-6">
        <Logo />
        <nav className="ms-6 hidden items-center lg:flex" aria-label={t("Main")}>
          <HoverLink href="/merge-pdf" className={navItem}>{t("Merge PDF")}</HoverLink>
          <HoverLink href="/split-pdf" className={navItem}>{t("Split PDF")}</HoverLink>
          <HoverLink href="/compress-pdf" className={navItem}>{t("Compress PDF")}</HoverLink>
          <div className="relative">
            <button className={`${navItem} flex items-center gap-1`} onClick={() => toggle("convert")} aria-expanded={open === "convert"}>
              {t("Convert PDF")} <Icon name="chevron-down" size={16} />
            </button>
            {open === "convert" && (
              <div className="absolute top-full start-0 mt-2 grid w-[460px] grid-cols-2 gap-4 rounded-xl border border-line bg-white p-4 shadow-xl">
                {Object.entries(CONVERT_MENU).map(([group, slugs]) => (
                  <div key={group}>
                    <p className="mb-2 px-2 text-xs font-bold tracking-wide text-muted uppercase">{t(group)}</p>
                    {slugs.map((s) => <ToolLink key={s} slug={s} onClick={close} />)}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="static">
            <button className={`${navItem} flex items-center gap-1`} onClick={() => toggle("all")} aria-expanded={open === "all"}>
              {t("All PDF Tools")} <Icon name="chevron-down" size={16} />
            </button>
            {open === "all" && (
              <div className="absolute inset-x-0 top-full border-b border-line bg-white shadow-xl">
                <div className="mx-auto grid max-w-[1440px] grid-cols-7 gap-4 px-6 py-6">
                  {Object.entries(ALL_TOOLS_MENU).map(([group, slugs]) => (
                    <div key={group}>
                      <p className="mb-2 px-2 text-xs font-bold tracking-wide text-muted uppercase">{t(group)}</p>
                      {slugs.map((s) => <ToolLink key={s} slug={s} onClick={close} />)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </nav>

        <div className="ms-auto flex items-center gap-2">
          {user ? (
            <div className="relative">
              <button
                onClick={() => toggle("user")}
                className="flex items-center gap-2 rounded-full border border-line py-1 ps-1 pe-3 text-sm font-medium hover:border-ink/40"
                aria-expanded={open === "user"}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                  {user.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden max-w-32 truncate sm:inline">{user.name}</span>
                <Icon name="chevron-down" size={14} />
              </button>
              {open === "user" && (
                <div className="absolute end-0 mt-2 w-60 rounded-xl border border-line bg-white p-2 shadow-xl">
                  <div className="border-b border-line px-3 pt-1 pb-2">
                    <p className="truncate text-sm font-semibold">{user.name}</p>
                    <p className="truncate text-xs text-muted">{user.email}</p>
                  </div>
                  <HoverLink href="/account" onClick={close} className="mt-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-bg">
                    <Icon name="user" size={16} /> {t("My account")}
                  </HoverLink>
                  <HoverLink href="/create-workflow" onClick={close} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-bg">
                    <Icon name="route" size={16} /> {t("My workflows")}
                  </HoverLink>
                  <HoverLink href="/account/signatures" onClick={close} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-bg">
                    <Icon name="signature" size={16} /> {t("Signatures")}
                  </HoverLink>
                  {user.admin && (
                    <HoverLink href="/admin" onClick={close} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-bg">
                      <Icon name="layout-dashboard" size={16} /> {t("Admin panel")}
                    </HoverLink>
                  )}
                  <button onClick={signOut} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-brand hover:bg-bg">
                    <Icon name="logout" size={16} /> {t("Log out")}
                  </button>
                </div>
              )}
            </div>
          ) : user === undefined ? (
            <span aria-hidden className="h-9 w-[150px] animate-pulse rounded-lg bg-bg" />
          ) : (
            <>
              <HoverLink href="/login" className="hidden px-3 py-2 text-sm font-semibold hover:text-brand sm:block">{t("Login")}</HoverLink>
              <HoverLink href="/signup" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
                {t("Sign up")}
              </HoverLink>
            </>
          )}
          <div className="relative hidden sm:block">
            <button onClick={() => toggle("apps")} className="rounded-lg p-2 hover:bg-bg" aria-label={t("Workify apps")} aria-expanded={open === "apps"}>
              <Icon name="grid-dots" size={26} />
            </button>
            {open === "apps" && (
              <div className="absolute end-0 mt-2 grid w-72 grid-cols-2 gap-1 rounded-xl border border-line bg-white p-3 shadow-xl">
                {APPS.map((a) => (
                  <HoverLink key={a.href} href={a.href} onClick={close} className="flex flex-col items-center gap-1.5 rounded-lg p-3 text-center text-xs font-medium hover:bg-bg">
                    <Icon name={a.icon} size={26} className="text-brand" />
                    {t(a.label)}
                  </HoverLink>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => setMobile((m) => !m)} className="rounded-lg p-2 hover:bg-bg lg:hidden" aria-label={t("Menu")} aria-expanded={mobile}>
            <Icon name={mobile ? "x" : "menu-2"} size={26} />
          </button>
        </div>
      </div>

      {mobile && (
        <div className="max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-line bg-white px-4 pb-6 lg:hidden">
          {!user && (
            <HoverLink href="/login" onClick={close} className="mt-3 block rounded-lg border border-line px-4 py-2 text-center font-semibold">
              {t("Login")}
            </HoverLink>
          )}
          {Object.entries(ALL_TOOLS_MENU).map(([group, slugs]) => (
            <div key={group} className="mt-4">
              <p className="mb-1 px-2 text-xs font-bold tracking-wide text-muted uppercase">{t(group)}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2">
                {slugs.map((s) => <ToolLink key={s} slug={s} onClick={close} />)}
              </div>
            </div>
          ))}
          <div className="mt-4 grid grid-cols-2 gap-1">
            {APPS.map((a) => (
              <HoverLink key={a.href} href={a.href} onClick={close} className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-bg">
                <Icon name={a.icon} size={18} className="text-brand" /> {t(a.label)}
              </HoverLink>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
