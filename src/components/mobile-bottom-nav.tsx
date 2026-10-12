"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CalendarIcon, ClubsIcon, HomeIcon, OpportunitiesIcon } from "./icons";
import { adminNavItems, isNavItemActive, mainNavItems } from "./sidebar";
import type { SessionUser } from "@/lib/supabase/types";
import type { TeacherPermission } from "@/lib/permissions";

const primaryItems = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/clubs", label: "Clubs", icon: ClubsIcon },
  { href: "/announcements", label: "Updates", icon: CalendarIcon },
  { href: "/opportunities", label: "Explore", icon: OpportunitiesIcon },
];

export default function MobileBottomNav({ user, permissions = [] }: { user: SessionUser | null; permissions?: TeacherPermission[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const closeRef = useRef<HTMLButtonElement>(null);
  const role = user?.role ?? "student";

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const close = () => setOpen(false);

  return <>
    <nav aria-label="Mobile primary navigation" className="fixed inset-x-0 bottom-0 z-[90] border-t border-line bg-card/95 px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_35px_rgba(0,0,0,.18)] backdrop-blur-xl lg:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {primaryItems.map((item) => {
          const Icon = item.icon;
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-semibold ${active ? "bg-navy text-cream" : "text-muted"}`}>
            <Icon className="h-5 w-5" />
            <span>{item.label}</span>
          </Link>;
        })}
        <button type="button" aria-label="Open all navigation" aria-expanded={open} onClick={() => setOpen(true)} className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-semibold ${open ? "bg-navy text-cream" : "text-muted"}`}>
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden><path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          <span>More</span>
        </button>
      </div>
    </nav>

    {open ? <div className="fixed inset-0 z-[100] lg:hidden" role="dialog" aria-modal="true" aria-label="All navigation">
      <button type="button" tabIndex={-1} aria-label="Close all navigation" onClick={close} className="absolute inset-0 h-full w-full bg-black/60 backdrop-blur-sm" />
      <section className="absolute inset-x-0 bottom-0 max-h-[82dvh] overflow-hidden rounded-t-[28px] border-t border-line bg-card pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl">
        <header className="flex items-center justify-between border-b border-line px-5 py-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-powder">Hatchx</p><h2 className="font-display text-xl font-bold text-ink">All navigation</h2></div><button ref={closeRef} type="button" aria-label="Close menu" onClick={close} className="flex h-10 w-10 items-center justify-center rounded-full bg-content-bg text-ink"><svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden><path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></button></header>
        <nav className="max-h-[calc(82dvh-76px)] overflow-y-auto px-4 py-4" aria-label="Mobile full navigation">
          {[...mainNavItems, ...adminNavItems].map((item) => {
            if (item.adminOnly && !["staff", "admin"].includes(role) && (role !== "teacher" || permissions.length === 0)) return null;
            const Icon = item.icon;
            const active = isNavItemActive(pathname, item);
            const subItems = item.sub?.filter((subItem) => (!subItem.roles || subItem.roles.includes(role)) && (!subItem.permission || ["staff", "admin"].includes(role) || permissions.includes(subItem.permission)));
            const destination = role === "teacher" && item.adminOnly ? subItems?.[0]?.href ?? item.href : item.href;
            return <div key={item.href} className="mb-2 rounded-card border border-line bg-content-bg/60 p-2"><Link href={destination} onClick={close} className={`flex items-center gap-3 rounded-control px-3 py-3 text-sm font-bold ${active ? "bg-navy text-cream" : "text-ink"}`}><Icon className="h-5 w-5" />{item.label}</Link>{subItems?.length ? <div className="grid grid-cols-2 gap-1 px-2 pb-2 pt-1">{subItems.map((subItem) => <Link key={subItem.href} href={subItem.href} onClick={close} className="rounded-lg px-2 py-2 text-xs font-medium text-muted hover:bg-card hover:text-ink">{subItem.label}</Link>)}</div> : null}</div>;
          })}
          <Link href="/profile" onClick={close} className="mt-3 flex items-center gap-3 rounded-card bg-navy px-4 py-3 text-sm font-bold text-cream"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-cream text-navy">{user?.name?.[0]?.toUpperCase() ?? "H"}</span>{user?.name ?? "Sign in"}</Link>
        </nav>
      </section>
    </div> : null}
  </>;
}
