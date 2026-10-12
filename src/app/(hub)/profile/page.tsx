import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { leaveClub, replyToMembershipDecision } from "@/app/(hub)/clubs/actions";
import { getCurrentUser } from "@/lib/auth";
import { isEventUpcoming, type EventItem } from "@/lib/data";
import { getEvents } from "@/lib/events";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerClient } from "@/lib/supabase/server";
import type { ClubApplicationRow, MyClubAttendance, SupportRequestRow } from "@/lib/supabase/types";

type ProfileClub = { id: string; membershipId: string; slug: string; name: string; status: "pending" | "active" | "rejected" | "left"; requestedAt: string; rejectionReason: string | null; memberReply: string | null; role: string; meetingDay: string; location: string };
type ProfileData = { clubs: ProfileClub[]; applications: ClubApplicationRow[]; rsvpIds: string[]; support: SupportRequestRow[]; attendance: MyClubAttendance[] };

export const metadata: Metadata = { title: "My Hub" };
export const dynamic = "force-dynamic";
const dayNames = ["", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts.at(-1)?.[0] ?? "" : ""}`.toUpperCase();
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

async function getProfileData(userId: string): Promise<ProfileData> {
  const empty: ProfileData = { clubs: [], applications: [], rsvpIds: [], support: [], attendance: [] };
  if (!isSupabaseConfigured()) return empty;
  const db = await createServerClient();
  const [memberships, officers, advisors, meetings, applications, rsvps, support, attendance] = await Promise.all([
    db.from("club_memberships").select("id, club_id, status, requested_at, rejection_reason, member_reply").eq("profile_id", userId).order("requested_at", { ascending: false }),
    db.from("club_officers").select("club_id, title").eq("profile_id", userId),
    db.from("club_advisors").select("club_id").eq("profile_id", userId),
    db.from("club_meetings").select("club_id, day_of_week, location").order("day_of_week"),
    db.from("club_applications").select("*").eq("submitted_by", userId).order("created_at", { ascending: false }).limit(5),
    db.from("event_rsvps").select("event_id").eq("user_id", userId),
    db.from("support_requests").select("*").eq("submitted_by", userId).order("updated_at", { ascending: false }).limit(5),
    db.rpc("get_my_club_attendance", { p_limit: 8 }),
  ]);
  const membershipRows = memberships.data ?? [];
  const clubIds = [...new Set(membershipRows.map((row) => row.club_id))];
  const clubRows = clubIds.length ? await db.from("clubs").select("id, slug, name").in("id", clubIds) : { data: [] as { id: string; slug: string; name: string }[] };
  const byId = new Map((clubRows.data ?? []).map((club) => [club.id, club]));
  const roles = new Map((officers.data ?? []).map((row) => [row.club_id, row.title]));
  const advised = new Set((advisors.data ?? []).map((row) => row.club_id));
  const schedules = new Map((meetings.data ?? []).map((row) => [row.club_id, row]));
  return {
    clubs: membershipRows.flatMap((membership) => {
      const club = byId.get(membership.club_id);
      if (!club) return [];
      const meeting = schedules.get(club.id);
      return [{ ...club, membershipId: membership.id, status: membership.status, requestedAt: membership.requested_at, rejectionReason: membership.rejection_reason, memberReply: membership.member_reply, role: roles.get(club.id) ?? (advised.has(club.id) ? "Advisor" : "Member"), meetingDay: meeting ? dayNames[meeting.day_of_week] : "Schedule TBA", location: meeting?.location ?? "Location TBA" }];
    }),
    applications: applications.data ?? [],
    rsvpIds: (rsvps.data ?? []).map((row) => row.event_id),
    support: support.data ?? [],
    attendance: attendance.data ?? [],
  };
}

function Stat({ value, label, href }: { value: number; label: string; href: string }) {
  return <Link href={href} className="rounded-card border border-line bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><strong className="font-display text-3xl text-ink">{value}</strong><span className="mt-1 block text-xs font-semibold uppercase tracking-wide text-muted">{label}</span></Link>;
}

function SectionHeader({ title, action, href }: { title: string; action?: string; href?: string }) {
  return <div className="flex items-end justify-between gap-3"><h2 className="font-display text-xl font-bold uppercase tracking-tight text-ink">{title}</h2>{action && href ? <Link href={href} className="text-xs font-bold text-powder hover:text-ink">{action} →</Link> : null}</div>;
}

function EventRow({ event, attending }: { event: EventItem; attending: boolean }) {
  return <Link href={`/events/${event.id}`} className="flex gap-3 rounded-control border border-line bg-card p-3 transition hover:border-powder/60"><span className="flex size-11 shrink-0 items-center justify-center rounded-control bg-navy text-xs font-bold text-cream">{event.dateISO?.slice(-2) ?? "•"}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-ink">{event.title}</strong><small className="mt-1 block truncate text-xs text-muted">{event.date} · {event.time} · {event.location}</small></span>{attending ? <span className="self-center rounded-full bg-powder/20 px-2.5 py-1 text-[10px] font-bold text-ink">GOING</span> : null}</Link>;
}

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/profile");
  const [data, allEvents] = await Promise.all([getProfileData(user.id), getEvents()]);
  const activeClubs = data.clubs.filter((club) => club.status === "active");
  const pendingClubs = data.clubs.filter((club) => club.status === "pending");
  const rsvpSet = new Set(data.rsvpIds);
  const upcomingEvents = allEvents.filter((event) => isEventUpcoming(event)).sort((a, b) => (a.dateISO ?? "").localeCompare(b.dateISO ?? "")).slice(0, 4);
  const myUpcoming = upcomingEvents.filter((event) => rsvpSet.has(event.id));
  const openSupport = data.support.filter((item) => ["open", "in_review"].includes(item.status));
  const pendingApplications = data.applications.filter((item) => item.status === "pending");
  const canManage = ["advisor", "staff", "admin"].includes(user.role) || activeClubs.some((club) => club.role !== "Member");

  return <div className="profile-backdrop min-h-full px-5 py-8 sm:px-8 lg:px-10"><div className="mx-auto max-w-7xl">
    <header className="overflow-hidden rounded-panel border border-line bg-card shadow-[0_24px_80px_-52px_rgba(88,154,239,.75)]">
      <div className="h-24 bg-[radial-gradient(circle_at_20%_10%,rgba(151,191,244,.9),transparent_35%),radial-gradient(circle_at_78%_30%,rgba(255,142,104,.75),transparent_38%),linear-gradient(120deg,#263a99,#11172c)] sm:h-32" />
      <div className="flex flex-col gap-5 px-5 pb-6 sm:flex-row sm:items-end sm:px-7"><div className="-mt-10 flex size-24 shrink-0 items-center justify-center rounded-[28px] border-4 border-card bg-navy font-display text-3xl font-bold text-cream shadow-lg">{initials(user.name)}</div><div className="min-w-0 flex-1 sm:pb-1"><p className="text-xs font-bold uppercase tracking-[.18em] text-powder">{user.role} account</p><h1 className="mt-1 truncate font-display text-3xl font-bold text-ink sm:text-4xl">{user.name}</h1><p className="mt-1 truncate text-sm text-muted">{user.email} · Bayside High School</p></div><div className="flex flex-wrap gap-2 sm:pb-1"><Link href="/clubs/check-in" className="rounded-full bg-navy px-4 py-2 text-xs font-bold text-cream">Quick check-in</Link><form action="/auth/signout" method="post"><button className="rounded-full border border-line bg-content-bg px-4 py-2 text-xs font-bold text-ink">Sign out</button></form><form action="/auth/signout-all" method="post"><button className="rounded-full border border-orange/60 bg-content-bg px-4 py-2 text-xs font-bold text-orange">Sign out all devices</button></form></div></div>
    </header>

    <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Account overview"><Stat value={activeClubs.length} label="Active clubs" href="#clubs" /><Stat value={pendingClubs.length} label="Pending joins" href="#clubs" /><Stat value={data.attendance.length} label="Recent check-ins" href="#attendance" /><Stat value={openSupport.length} label="Open requests" href="#activity" /></section>

    <div className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.75fr)]"><main className="min-w-0 space-y-8">
      <section id="clubs"><SectionHeader title="My clubs" action="Browse all clubs" href="/clubs" />
        {data.clubs.length ? <div className="mt-4 grid gap-3 md:grid-cols-2">{data.clubs.map((club) => <article key={club.membershipId} className="rounded-card border border-line bg-card p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-wider text-powder">{club.role}</p><h3 className="mt-1 font-display text-lg font-bold text-ink">{club.name}</h3></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${club.status === "active" ? "bg-powder/20 text-ink" : "bg-orange/20 text-orange"}`}>{club.status}</span></div><p className="mt-3 text-sm text-muted">{club.meetingDay} · {club.location}</p>{club.status === "rejected" && club.rejectionReason ? <div className="mt-3 rounded-control bg-orange/10 p-3 text-sm text-ink"><p><strong>Reason:</strong> {club.rejectionReason}</p>{club.memberReply ? <p className="mt-2 text-muted"><strong>Your reply:</strong> {club.memberReply}</p> : <form action={replyToMembershipDecision} className="mt-3 flex gap-2"><input type="hidden" name="membership_id" value={club.membershipId} /><input name="reply" required maxLength={1000} placeholder="Reply to the Club" className="h-10 min-w-0 flex-1 rounded-control border border-line bg-content-bg px-3 text-sm" /><button className="rounded-full bg-navy px-4 text-xs font-bold text-cream">Reply</button></form>}</div> : null}<div className="mt-4 flex flex-wrap gap-2"><Link href={`/clubs/${club.slug}`} className="rounded-full bg-navy px-3.5 py-2 text-xs font-semibold text-cream">Open club</Link><Link href="/calendar" className="rounded-full border border-line px-3.5 py-2 text-xs font-semibold text-ink">Calendar</Link>{club.status === "active" ? <form action={leaveClub}><input type="hidden" name="club_id" value={club.id} /><input type="hidden" name="slug" value={club.slug} /><button className="rounded-full px-3 py-2 text-xs font-semibold text-muted hover:text-orange">Leave</button></form> : null}</div></article>)}</div> : <div className="mt-4 rounded-card border border-dashed border-line bg-card/70 p-8 text-center text-sm text-muted">You have not joined a Club yet. <Link href="/clubs" className="font-bold text-powder">Explore the directory</Link>.</div>}
      </section>

      <section id="attendance"><SectionHeader title="Check-in history" action="Enter a code" href="/clubs/check-in" />
        {data.attendance.length ? <div className="mt-4 overflow-hidden rounded-card border border-line bg-card"><div className="divide-y divide-line">{data.attendance.map((entry) => <Link key={entry.id} href={`/clubs/${entry.club_slug}`} className="flex items-center gap-3 p-4 transition hover:bg-content-bg/60"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-powder/20 text-powder">✓</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-ink">{entry.session_label}</strong><small className="mt-0.5 block truncate text-xs text-muted">{entry.club_name}</small></span><time dateTime={entry.checked_in_at} className="text-right text-xs text-muted">{dateTime(entry.checked_in_at)}</time></Link>)}</div></div> : <div className="mt-4 rounded-card border border-dashed border-line bg-card/70 p-6 text-center text-sm text-muted">Your completed Club check-ins will appear here.</div>}
      </section>

      <section id="activity"><SectionHeader title="Requests" action="Get support" href="/support" /><div className="mt-4 rounded-card border border-line bg-card p-5"><h3 className="text-sm font-bold text-ink">Support requests</h3>{data.support.length ? <ul className="mt-3 divide-y divide-line">{data.support.map((item) => <li key={item.id} className="py-3"><Link href={`/support/${item.id}`} className="block rounded-lg p-2 transition hover:bg-content-bg"><div className="flex items-center justify-between gap-3"><span className="truncate text-sm text-ink">{item.subject}</span><span className="text-[10px] font-bold uppercase text-muted">{item.status.replace("_", " ")}</span></div><p className="mt-1 text-xs capitalize text-muted">{item.request_type.replaceAll("_", " ")} · Open conversation →</p></Link></li>)}</ul> : <p className="mt-3 text-sm text-muted">No support requests.</p>}</div><details className="group mt-3 rounded-card border border-line bg-card"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 [&::-webkit-details-marker]:hidden"><div><h3 className="text-sm font-bold text-ink">Club application history</h3><p className="mt-1 text-xs text-muted">{pendingApplications.length ? `${pendingApplications.length} awaiting review` : `${data.applications.length} recent applications`}</p></div><span className="text-xl text-muted transition-transform group-open:rotate-45" aria-hidden>+</span></summary><div className="border-t border-line px-5 pb-5">{data.applications.length ? <ul className="divide-y divide-line">{data.applications.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span className="truncate text-ink">{item.club_name}</span><span className={`text-xs font-bold uppercase ${item.status === "pending" ? "text-orange" : "text-muted"}`}>{item.status}</span></li>)}</ul> : <p className="py-4 text-sm text-muted">No applications submitted.</p>}<Link href="/clubs/apply" className="inline-block text-xs font-bold text-powder">Start a Club application →</Link></div></details></section>
    </main>

    <aside className="min-w-0 space-y-6"><section><SectionHeader title="Coming up" action="Full calendar" href="/calendar" /><div className="mt-4 space-y-2">{(myUpcoming.length ? myUpcoming : upcomingEvents).map((event) => <EventRow key={event.id} event={event} attending={rsvpSet.has(event.id)} />)}{!upcomingEvents.length ? <p className="rounded-card border border-dashed border-line bg-card p-5 text-sm text-muted">No upcoming events.</p> : null}</div></section>
      <section className="rounded-card border border-line bg-card p-5"><h2 className="font-display text-xl font-bold uppercase text-ink">Quick actions</h2><nav className="mt-4 grid grid-cols-2 gap-2" aria-label="Profile quick actions">{[{ href: "/clubs/check-in", label: "Check in", icon: "✓" }, { href: "/clubs", label: "Find a Club", icon: "＋" }, { href: "/calendar", label: "Calendar", icon: "○" }, { href: "/announcements", label: "Updates", icon: "↗" }, { href: "/clubs/apply", label: "Start a Club", icon: "✦" }, { href: "/support", label: "Get help", icon: "?" }].map((item) => <Link key={item.href} href={item.href} className="flex min-h-24 flex-col justify-between rounded-control border border-line bg-content-bg p-3 text-sm font-semibold text-ink transition hover:border-powder"><span className="text-xl text-powder">{item.icon}</span>{item.label}</Link>)}</nav>{canManage ? <Link href="/clubs/manage" className="mt-3 flex items-center justify-between rounded-control bg-navy px-4 py-3 text-sm font-bold text-cream"><span>Manage my Clubs</span><span>→</span></Link> : null}</section>
      <section className="rounded-card border border-line bg-card p-5"><h2 className="text-sm font-bold text-ink">Account details</h2><dl className="mt-4 space-y-3 text-sm"><div><dt className="text-xs text-muted">School email</dt><dd className="mt-0.5 break-all font-medium text-ink">{user.email}</dd></div><div><dt className="text-xs text-muted">Access role</dt><dd className="mt-0.5 capitalize text-ink">{user.role}</dd></div></dl><div className="mt-4 flex gap-4 text-xs font-semibold text-muted"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div></section>
    </aside></div>
  </div></div>;
}
