import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { isEventUpcoming } from "@/lib/data";
import { getEvents } from "@/lib/events";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerClient } from "@/lib/supabase/server";
import type { CalendarSourceRow, EventRow } from "@/lib/supabase/types";
import CalendarAdminPanel from "./calendar-admin-panel";
import CalendarBoard from "./calendar-board";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage() {
  const [events, user] = await Promise.all([getEvents(), getCurrentUser()]);
  const isAdmin = user?.role === "admin";
  let adminEvents: EventRow[] = [];
  let calendars: CalendarSourceRow[] = [];
  let clubs: Array<{ id: string; name: string }> = [];
  if (isAdmin && isSupabaseConfigured()) {
    const db = await createServerClient();
    const [eventResult, calendarResult, clubResult] = await Promise.all([
      db.from("events").select("*").order("start_at"),
      db.from("calendar_sources").select("*").order("name"),
      db.from("clubs").select("id,name").order("name"),
    ]);
    adminEvents = eventResult.data ?? [];
    calendars = calendarResult.data ?? [];
    clubs = clubResult.data ?? [];
  }
  const upcoming = events.filter(event => isEventUpcoming(event)).sort((a, b) => `${a.dateISO ?? ""}${a.time}`.localeCompare(`${b.dateISO ?? ""}${b.time}`));
  return <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:py-12">
    <header className="flex flex-col gap-5 border-b border-line pb-7 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="text-xs font-bold uppercase tracking-[0.22em] text-powder">Dates, activities, and meetings</p><h1 className="mt-2 font-display text-4xl font-bold uppercase tracking-tight text-ink sm:text-6xl">School Calendar</h1><p className="mt-3 max-w-2xl text-base leading-7 text-muted">Browse every school event, sports date, and Club meeting in one place.</p></div>
      <div className="flex flex-wrap gap-2"><Link href="/calendar/registration" className="inline-flex h-11 items-center rounded-full bg-navy px-5 text-sm font-bold text-cream">Registration &amp; status</Link><a href="/calendar.ics" className="inline-flex h-11 items-center rounded-full border border-line bg-card px-5 text-sm font-bold text-ink">Add to my calendar</a>{isAdmin ? <Link href="/admin/events" className="inline-flex h-11 items-center rounded-full border border-powder/50 bg-card px-5 text-sm font-bold text-ink">Advanced event tools</Link> : null}</div>
    </header>
    {isAdmin ? <CalendarAdminPanel calendars={calendars} clubs={clubs}/> : null}
    <section className="mt-7" aria-labelledby="calendar-title"><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-powder">Plan ahead</p><h2 id="calendar-title" className="mt-1 text-2xl font-bold text-ink">Month, daily agenda, and list</h2></div><span className="rounded-full border border-line bg-card px-3 py-1 text-xs font-semibold text-muted">{upcoming.length} upcoming</span></div><CalendarBoard events={events} adminEvents={isAdmin ? adminEvents : undefined} calendars={calendars} clubs={clubs}/></section>
  </div>;
}
