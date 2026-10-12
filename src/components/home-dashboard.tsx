import Link from "next/link";
import { AnnouncementCard } from "@/components/cards";
import type { Announcement, EventItem, Opportunity } from "@/lib/data";
import type { StudentDashboard } from "@/lib/student-dashboard";
import type { SessionUser } from "@/lib/supabase/types";
import DashboardPersonalCards from "./dashboard-personal-cards";
import DashboardNow from "./dashboard-now";

const roleLabels: Record<SessionUser["role"], string> = {
  student: "Student",
  teacher: "Teacher",
  advisor: "Club advisor",
  staff: "Staff",
  admin: "Administrator",
};

function StatCard({ label, value, href }: { label: string; value: number | null; href: string }) {
  return <Link href={href} className="rounded-card border border-line bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-powder/60 hover:shadow-md"><strong className="font-display text-3xl text-ink">{value ?? "—"}</strong><span className="mt-1 block text-xs font-bold uppercase tracking-[0.12em] text-muted">{label}</span></Link>;
}

function EmptyCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-card border border-dashed border-line bg-card/70 p-6 text-center text-sm text-muted">{children}</div>;
}

export default function HomeDashboard({
  user,
  dashboard,
  announcements,
  events,
  opportunities,
  unavailableSections,
}: {
  user: SessionUser;
  dashboard: StudentDashboard | null;
  announcements: Announcement[];
  events: EventItem[];
  opportunities: Opportunity[];
  unavailableSections: string[];
}) {
  const firstName = user.name.trim().split(/\s+/)[0] || "there";
  const today = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());
  const [featured, ...moreAnnouncements] = announcements;
  const hasAdminWorkspace = ["staff", "admin"].includes(user.role);
  const canManage = hasAdminWorkspace || (dashboard?.managedClubCount ?? 0) > 0;

  return <div className="profile-backdrop min-h-full px-5 py-7 sm:px-8 lg:px-10"><div className="mx-auto max-w-7xl">
    <header className="overflow-hidden rounded-panel border border-line bg-card shadow-[0_24px_80px_-52px_rgba(88,154,239,.75)]">
      <div className="grid gap-6 bg-[radial-gradient(circle_at_10%_0%,rgba(151,191,244,.34),transparent_34%),radial-gradient(circle_at_92%_30%,rgba(255,142,104,.25),transparent_30%)] px-6 py-7 sm:px-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-powder">{today}</p><DashboardNow firstName={firstName} /></div>
        <div className="flex flex-wrap gap-2"><span className="inline-flex items-center rounded-full border border-line bg-content-bg px-4 py-2 text-xs font-bold text-ink">{roleLabels[user.role]}</span><Link href="/profile" className="rounded-full bg-navy px-4 py-2 text-xs font-bold text-cream">Open my profile</Link></div>
      </div>
    </header>

    {unavailableSections.length ? <p role="status" className="mt-4 rounded-control border border-orange/35 bg-orange/10 px-4 py-3 text-sm text-ink">Some information is temporarily unavailable: {unavailableSections.join(", ")}. The rest of your dashboard is still ready.</p> : null}

    <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Personal overview">
      <StatCard label="My clubs" value={dashboard?.activeClubs.length ?? null} href="/profile#clubs" />
      <StatCard label="Pending joins" value={dashboard?.pendingMemberships ?? null} href="/profile#clubs" />
      <StatCard label="Applications" value={dashboard?.pendingApplications ?? null} href="/profile#activity" />
      <StatCard label="Open requests" value={dashboard?.openSupportRequests ?? null} href="/profile#activity" />
    </section>

    {dashboard ? <DashboardPersonalCards dashboard={dashboard} /> : null}

    <div className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,.75fr)]">
      <div className="min-w-0 space-y-8">
        <section aria-labelledby="latest-announcement"><div className="mb-4 flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-powder">Latest update</p><h2 id="latest-announcement" className="mt-1 font-display text-2xl font-bold uppercase text-ink">Announcements</h2></div><Link href="/announcements" className="text-xs font-bold text-powder">View all →</Link></div>{featured ? <AnnouncementCard a={featured} /> : <EmptyCard>{unavailableSections.includes("announcements") ? "Announcements are temporarily unavailable." : "No current announcements."}</EmptyCard>}{moreAnnouncements.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{moreAnnouncements.slice(0, 2).map((item) => <Link key={item.id} href={`/announcements/${item.id}`} className="rounded-control border border-line bg-card p-4 transition hover:border-powder/60"><p className="text-[10px] font-bold uppercase tracking-wider text-powder">{item.tag} · {item.date}</p><h3 className="mt-1 line-clamp-1 text-sm font-bold text-ink">{item.title}</h3></Link>)}</div> : null}</section>

        <section aria-labelledby="upcoming-events"><div className="mb-4 flex items-end justify-between gap-4"><h2 id="upcoming-events" className="font-display text-2xl font-bold uppercase text-ink">Coming up</h2><Link href="/calendar" className="text-xs font-bold text-powder">Full calendar →</Link></div>{events.length ? <div className="overflow-hidden rounded-card border border-line bg-card shadow-sm"><div className="divide-y divide-line">{events.slice(0, 4).map((event) => <Link key={event.id} href={`/events/${event.id}`} className="flex items-center gap-4 p-4 transition hover:bg-content-bg/70"><span className="flex size-11 shrink-0 items-center justify-center rounded-control bg-navy text-xs font-bold text-cream">{event.dateISO?.slice(-2) ?? "•"}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-ink">{event.title}</strong><small className="mt-1 block truncate text-xs text-muted">{event.date} · {event.time} · {event.location}</small></span><span className="text-powder" aria-hidden>→</span></Link>)}</div></div> : <EmptyCard>{unavailableSections.includes("events") ? "Events are temporarily unavailable." : "No upcoming events have been published."}</EmptyCard>}</section>
      </div>

      <aside className="min-w-0 space-y-6">
        <section className="rounded-card border border-line bg-card p-5 shadow-sm"><h2 className="font-display text-xl font-bold uppercase text-ink">Quick actions</h2><nav className="mt-4 grid grid-cols-2 gap-2" aria-label="Dashboard quick actions">{[
          { href: "/clubs/check-in", label: "Check in", icon: "✓" },
          { href: "/calendar", label: "Calendar", icon: "○" },
          { href: "/clubs", label: "Find a Club", icon: "+" },
          { href: "/support", label: "Get help", icon: "?" },
        ].map((item) => <Link key={item.href} href={item.href} className="flex min-h-20 flex-col justify-between rounded-control border border-line bg-content-bg p-3 text-sm font-semibold text-ink transition hover:border-powder"><span className="text-lg text-powder">{item.icon}</span>{item.label}</Link>)}</nav>{canManage ? <Link href={hasAdminWorkspace ? "/admin" : "/clubs/manage"} className="mt-3 flex items-center justify-between rounded-control bg-navy px-4 py-3 text-sm font-bold text-cream"><span>{hasAdminWorkspace ? "Open Admin" : "Manage Clubs"}</span><span>→</span></Link> : null}</section>

        <section className="rounded-card border border-line bg-card p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><h2 className="font-display text-xl font-bold uppercase text-ink">My Clubs</h2><Link href="/profile#clubs" className="text-xs font-bold text-powder">Details →</Link></div>{dashboard?.activeClubs.length ? <div className="mt-4 space-y-2">{dashboard.activeClubs.slice(0, 5).map((club) => <Link key={club.id} href={`/clubs/${club.slug}`} className="flex items-center justify-between rounded-control border border-line bg-content-bg px-4 py-3 text-sm font-semibold text-ink transition hover:border-powder"><span className="truncate">{club.name}</span><span className="text-powder">→</span></Link>)}</div> : <p className="mt-4 text-sm leading-6 text-muted">{dashboard ? <>You have not joined a Club yet. <Link href="/clubs" className="font-bold text-powder">Explore Clubs</Link>.</> : "Your Clubs are temporarily unavailable."}</p>}</section>

        <section className="rounded-card border border-line bg-card p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><h2 className="font-display text-xl font-bold uppercase text-ink">Opportunities</h2><Link href="/opportunities" className="text-xs font-bold text-powder">View all →</Link></div>{opportunities.length ? <div className="mt-4 space-y-3">{opportunities.slice(0, 3).map((item) => <Link key={item.id} href={`/opportunities/${item.id}`} className="block border-b border-line pb-3 last:border-0 last:pb-0"><p className="text-[10px] font-bold uppercase tracking-wider text-orange">{item.type}</p><h3 className="mt-1 line-clamp-2 text-sm font-semibold text-ink">{item.title}</h3><p className="mt-1 text-xs text-muted">{item.date}</p></Link>)}</div> : <p className="mt-4 text-sm text-muted">{unavailableSections.includes("opportunities") ? "Opportunities are temporarily unavailable." : "No current opportunities."}</p>}</section>
      </aside>
    </div>
  </div></div>;
}
