"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import "./sidebar.css";
import {
  LogoMark,
  HomeIcon,
  MegaphoneIcon,
  ClubsIcon,
  OpportunitiesIcon,
  SupportIcon,
  InfoIcon,
  AdminIcon,
} from "./icons";
import type { Role } from "@/lib/supabase/types";
import type { TeacherPermission } from "@/lib/permissions";

export type SubItem = { href: string; label: string; roles?: Role[]; permission?: TeacherPermission };

export type NavItem = {
  href: string;
  label: string;
  icon: (props: React.SVGProps<SVGSVGElement>) => React.ReactNode;
  sub?: SubItem[];
  adminOnly?: boolean;
};

export const mainNavItems: NavItem[] = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/announcements", label: "Updates & Calendar", icon: MegaphoneIcon, sub: [
    { href: "/announcements", label: "Latest Updates" },
    { href: "/calendar", label: "School Calendar" },
    { href: "/announcements?view=schedule", label: "Bell Schedule" },
    { href: "/announcements/submit", label: "Submit for Review" },
  ] },
  {
    href: "/clubs",
    label: "Activities & Clubs",
    icon: ClubsIcon,
    sub: [
      { href: "/clubs", label: "All Clubs" },
      { href: "/clubs/quiz", label: "Club 101 Quiz" },
      { href: "/clubs/manage", label: "Manage My Clubs" },
      { href: "/clubs/apply", label: "Apply for a New Club" },
      { href: "/sports", label: "Sports" },
    ],
  },
  {
    href: "/opportunities",
    label: "Opportunities",
    icon: OpportunitiesIcon,
    sub: [
      { href: "/opportunities", label: "All Opportunities" },
      { href: "/opportunities/internships", label: "Internships" },
      { href: "/opportunities/scholarships", label: "Scholarships" },
      { href: "/opportunities/pre-college", label: "College Prep" },
      { href: "/opportunities/community-service", label: "Community Service" },
    ],
  },
  {
    href: "/support",
    label: "Support",
    icon: SupportIcon,
    sub: [
      { href: "/support", label: "Support Home" },
      { href: "/support#request-support", label: "Submit a Request" },
      { href: "/support#my-requests", label: "My Requests" },
      { href: "/support/manual", label: "Help Guide" },
    ],
  },
  { href: "/about", label: "About Us", icon: InfoIcon },
];

export const adminNavItems: NavItem[] = [
  {
    href: "/admin",
    label: "Administration",
    icon: AdminIcon,
    adminOnly: true,
    sub: [
      { href: "/admin", label: "Admin Home", roles: ["admin"] },
      { href: "/admin/review", label: "Announcement Review", roles: ["admin"] },
      { href: "/admin/announcements", label: "Post Announcement", permission: "announcements.manage" },
      { href: "/admin/clubs", label: "Manage Clubs", roles: ["admin"] },
      { href: "/admin/support", label: "Support Requests", permission: "support.manage" },
      { href: "/admin/opportunities", label: "Manage Opportunities", permission: "opportunities.manage" },
      { href: "/admin/events", label: "Manage Events", permission: "events.manage" },
      { href: "/admin/data", label: "Data", roles: ["admin"] },
      { href: "/admin/users", label: "Manage Users", roles: ["admin"] },
      { href: "/admin/audit", label: "Management Audit", roles: ["admin"] },
      { href: "/manage/site", label: "Public Content", permission: "site.manage" },
    ],
  },
];

export function isNavItemActive(pathname: string, item: NavItem) {
  if (item.href === "/") return pathname === "/";
  if (item.href === "/clubs") {
    return pathname.startsWith("/clubs") || pathname === "/sports";
  }
  return pathname.startsWith(item.href);
}

export function isSubItemActive(pathname: string, href: string) {
  if (href.includes("#") || href.includes("?")) return false;
  const destination = href.split(/[?#]/)[0];
  if (["/clubs", "/opportunities", "/support", "/admin"].includes(destination)) return pathname === destination;
  return pathname === destination || pathname.startsWith(`${destination}/`);
}

/** Figma rail icons are committed exports, not approximated glyphs. */
const railAssets: Record<string, string> = {
  "/": "home", "/announcements": "mail", "/clubs": "activities",
  "/opportunities": "briefcase",
  "/support": "question", "/about": "form", "/admin": "shield",
  "/clubs/manage": "manage",
};

function RailIcon({ name }: { name: string }) {
  return <Image src={`/navigation/${name}.svg`} width={24} height={24} alt="" aria-hidden />;
}

/** Native popovers live in the browser top layer, above content stacking contexts. */
function canOpenSubItem(item: SubItem, role: Role, permissions: TeacherPermission[]) {
  return (!item.roles || item.roles.includes(role)) && (!item.permission || ["staff", "admin"].includes(role) || permissions.includes(item.permission));
}

function RailItem({ item, pathname, role, permissions }: { item: NavItem; pathname: string; role: Role; permissions: TeacherPermission[] }) {
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const active = isNavItemActive(pathname, item);
  const classes = `rail-control ${active ? "rail-control-active" : ""}`;

  useEffect(() => {
    const close = () => panel.current?.hidePopover();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && panel.current?.matches(":popover-open")) {
        close();
        trigger.current?.focus();
      }
    };
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  function position() {
    const node = panel.current;
    const button = trigger.current;
    if (!node || !button) return;
    const rect = button.getBoundingClientRect();
    node.style.left = `${(button.closest("aside")?.getBoundingClientRect().right ?? rect.right) + 8}px`;
    node.style.top = `${Math.max(12, Math.min(rect.top, window.innerHeight - node.offsetHeight - 12))}px`;
  }

  const glyph = <RailIcon name={railAssets[item.href] ?? "form"} />;
  if (!item.sub) return <Link href={item.href} aria-label={item.label} title={item.label} aria-current={active ? "page" : undefined} className={classes}>{glyph}</Link>;
  return (
    <div>
      <button ref={trigger} type="button" className={classes} title={item.label} aria-label={item.label} aria-expanded={expanded} aria-controls={id} popoverTarget={id}>{glyph}</button>
      <div ref={panel} id={id} popover="auto" className="rail-popover" aria-label={item.label}
        onToggle={(event) => {
          const isOpen = event.newState === "open";
          setExpanded(isOpen);
          if (isOpen) position();
        }}>
        <p className="px-3 pb-2 pt-1 text-xs font-medium tracking-wide text-muted">{item.label}</p>
        {item.sub.filter(sub => canOpenSubItem(sub, role, permissions)).map(sub => (
          <Link key={sub.href} href={sub.href} aria-current={isSubItemActive(pathname, sub.href) ? "page" : undefined}
            onClick={() => panel.current?.hidePopover()}
            className="rail-sub-link">{sub.label}</Link>
        ))}
      </div>
    </div>
  );
}

export default function Sidebar({ role = "student", permissions = [] }: { role?: Role; name?: string; permissions?: TeacherPermission[] }) {
  const pathname = usePathname();
  const groups = [
    { label: "General", items: mainNavItems.filter(item => !["/support", "/about"].includes(item.href)) },
    { label: "Myspace", items: [
      { href: "/clubs/manage", label: "Manage My Clubs", icon: ClubsIcon },
      ...(["teacher", "admin"].includes(role) ? adminNavItems : []),
    ] },
    { label: "Support", items: mainNavItems.filter(item => ["/support", "/about"].includes(item.href)) },
  ];
  return (
    <aside aria-label="Primary navigation" className="figma-rail">
      <Link href="/" aria-label="Hatchx home" title="Hatchx" className="rail-brand"><LogoMark className="h-10 w-10" /></Link>
      <nav aria-label="Main navigation" className="rail-groups" onScroll={() => {
        document.querySelectorAll<HTMLElement>(".rail-popover:popover-open").forEach(node => node.hidePopover());
      }}>
        {groups.map(group => (
          <section key={group.label} aria-label={group.label} className="rail-group">
            <h2>{group.label}</h2>
            {group.items.map(item => <RailItem key={item.href} item={item} pathname={pathname} role={role} permissions={permissions} />)}
          </section>
        ))}
      </nav>
    </aside>
  );
}
