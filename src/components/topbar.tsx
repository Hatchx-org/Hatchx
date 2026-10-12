"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark, NotificationIcon } from "./icons";
import SearchBox from "./search-box";
import type { SessionUser } from "@/lib/supabase/types";
import ThemeToggle from "./theme-toggle";

function initials(user: SessionUser) {
  const parts = user.name.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export default function Topbar({ user, unreadNotifications = 0 }: { user: SessionUser | null; unreadNotifications?: number }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");

  return (
    <header
      className={`site-topbar relative z-[70] flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line bg-content-bg px-4 sm:px-6 ${
        isAdmin ? "theme-light" : ""
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/"
          aria-label="Hatchx home"
          className="flex h-9 w-9 items-center justify-center rounded-full text-ink transition-colors hover:bg-cream/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-powder lg:hidden"
        >
          <LogoMark className="h-8 w-8" />
        </Link>
      </div>
      <SearchBox />
      <div className="flex shrink-0 items-center gap-3">
        <ThemeToggle />
        {user ? (
          <>
            <Link href="/notifications" title="Notifications" aria-label={`${unreadNotifications} unread notifications`} className="relative flex h-9 w-9 items-center justify-center rounded-full border border-line bg-card text-ink transition-colors hover:bg-content-bg hover:text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"><NotificationIcon className="size-5" />{unreadNotifications > 0 ? <span className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-orange px-1 text-[9px] font-bold text-black">{Math.min(unreadNotifications, 99)}</span> : null}</Link>
            <div className="hidden text-right sm:block">
              <p className="text-xs font-medium text-ink">Welcome, {user.name}</p>
              <p className="text-[11px] text-muted">
                {user.email} · {user.role}
              </p>
            </div>
            <Link
              href="/profile"
              title="My Profile"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-cream text-sm font-bold text-navy ring-1 ring-line transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
            >
              {initials(user)}
            </Link>
          </>
        ) : (
          <Link
            href="/login"
            className="rounded-full bg-navy px-4 py-2 text-xs font-semibold text-cream transition-colors hover:bg-navy-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
