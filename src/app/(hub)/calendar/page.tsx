import type { Metadata } from "next";
import Link from "next/link";
import { EventCard } from "@/components/cards";
import { isEventUpcoming } from "@/lib/data";
import { getEvents } from "@/lib/events";
import CalendarBoard from "./calendar-board";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage() {
  const events = await getEvents();
  const upcoming = events.filter(event => isEventUpcoming(event)).sort((a, b) => `${a.dateISO ?? ""}${a.time}`.localeCompare(`${b.dateISO ?? ""}${b.time}`));
  return <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:py-12">
    <header className="flex flex-col gap-5 border-b border-line pb-7 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="text-xs font-bold uppercase tracking-[0.22em] text-powder">Dates, activities, and meetings</p><h1 className="mt-2 font-display text-4xl font-bold uppercase tracking-tight text-ink sm:text-6xl">School Calendar</h1><p className="mt-3 max-w-2xl text-base leading-7 text-muted">Browse every school event, sports date, and Club meeting in one place.</p></div>
      <div className="flex flex-wrap gap-2"><Link href="/calendar/registration" className="inline-flex h-11 items-center rounded-full bg-navy px-5 text-sm font-bold text-cream">Registration &amp; status</Link><a href="/calendar.ics" className="inline-flex h-11 items-center rounded-full border border-line bg-card px-5 text-sm font-bold text-ink">Add to my calendar</a></div>
    </header>
    <section className="mt-7" aria-labelledby="calendar-title"><div className="mb-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-powder">Plan ahead</p><h2 id="calendar-title" className="mt-1 text-2xl font-bold text-ink">Month and list views</h2></div><CalendarBoard events={events} /></section>
    <section className="mt-10" aria-labelledby="upcoming-title"><div className="mb-5 flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-powder">Next up</p><h2 id="upcoming-title" className="mt-1 text-2xl font-bold text-ink">Upcoming calendar items</h2></div><span className="text-sm text-muted">{upcoming.length} scheduled</span></div>{upcoming.length ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{upcoming.slice(0, 30).map(event => <EventCard key={event.id} event={event} />)}</div> : <p className="rounded-card border border-dashed border-line bg-card px-6 py-12 text-center text-sm text-muted">No upcoming calendar items have been published yet.</p>}</section>
  </div>;
}
