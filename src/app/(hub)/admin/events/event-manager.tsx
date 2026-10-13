"use client";

import { useMemo, useState } from "react";
import type { CalendarSourceRow, EventRow } from "@/lib/supabase/types";
import EventForm from "./event-form";

const control = "h-10 rounded-full border border-line bg-content-bg px-4 text-sm text-ink outline-none focus:border-navy";

export default function EventManager({ events, calendars, clubs, canManageMeetingEffects, now }: {
  events: EventRow[];
  calendars: CalendarSourceRow[];
  clubs: Array<{ id: string; name: string }>;
  canManageMeetingEffects: boolean;
  now: string;
}) {
  const [query, setQuery] = useState("");
  const [calendar, setCalendar] = useState("all");
  const [status, setStatus] = useState("all");
  const [time, setTime] = useState("upcoming");
  const calendarNames = useMemo(() => new Map(calendars.map(item => [item.id, item.name])), [calendars]);
  const nowMs = new Date(now).getTime();
  const filtered = useMemo(() => events.filter(event => {
    const haystack = `${event.title} ${event.description} ${event.location ?? ""}`.toLowerCase();
    if (query.trim() && !haystack.includes(query.trim().toLowerCase())) return false;
    if (calendar === "main" && event.calendar_id) return false;
    if (calendar !== "all" && calendar !== "main" && event.calendar_id !== calendar) return false;
    if (status === "published" && !event.published) return false;
    if (status === "draft" && event.published) return false;
    const eventTime = new Date(event.end_at ?? event.start_at).getTime();
    if (time === "upcoming" && eventTime < nowMs) return false;
    if (time === "past" && eventTime >= nowMs) return false;
    return true;
  }).sort((a, b) => time === "past" ? b.start_at.localeCompare(a.start_at) : a.start_at.localeCompare(b.start_at)), [calendar, events, nowMs, query, status, time]);

  return <section className="rounded-card border border-line bg-card p-5 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-powder">Manage</p><h2 className="mt-1 text-2xl font-bold text-ink">Calendar events</h2><p className="mt-1 text-sm text-muted">Find an event, expand it, then edit or delete it.</p></div><span className="rounded-full bg-content-bg px-3 py-1 text-xs font-bold text-muted">{filtered.length} shown</span></div>
    <div className="mt-5 grid gap-2 md:grid-cols-[minmax(180px,1fr)_auto_auto_auto]">
      <label className="sr-only" htmlFor="calendar-event-search">Search events</label><input id="calendar-event-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search events…" className={`${control} w-full`}/>
      <select aria-label="Time range" value={time} onChange={event => setTime(event.target.value)} className={control}><option value="upcoming">Upcoming</option><option value="past">Past</option><option value="all">All dates</option></select>
      <select aria-label="Publication status" value={status} onChange={event => setStatus(event.target.value)} className={control}><option value="all">Any status</option><option value="published">Published</option><option value="draft">Draft</option></select>
      <select aria-label="Calendar" value={calendar} onChange={event => setCalendar(event.target.value)} className={control}><option value="all">All calendars</option><option value="main">Main calendar</option>{calendars.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
    </div>
    <div className="mt-5 space-y-3">
      {filtered.map(event => {
        const date = new Date(event.start_at);
        return <details key={event.id} className="group rounded-[16px] border border-line bg-content-bg open:bg-card">
          <summary className="grid cursor-pointer list-none grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
            <time dateTime={event.start_at} className="rounded-[12px] bg-navy px-2 py-2 text-center text-cream"><span className="block text-[10px] font-bold uppercase">{date.toLocaleString("en-US", { month: "short", timeZone: "America/New_York" })}</span><span className="block text-xl font-black leading-5">{date.toLocaleString("en-US", { day: "numeric", timeZone: "America/New_York" })}</span></time>
            <span className="min-w-0"><span className="block truncate font-bold text-ink">{event.title}</span><span className="mt-1 block truncate text-xs text-muted">{date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" })}{event.location ? ` · ${event.location}` : ""} · {event.calendar_id ? calendarNames.get(event.calendar_id) ?? "Custom calendar" : "Main calendar"}</span></span>
            <span className="flex items-center gap-2"><span className={`hidden rounded-full px-2.5 py-1 text-[10px] font-bold uppercase sm:inline ${event.published ? "bg-[#23864c]/10 text-[#176b35]" : "bg-orange/10 text-orange"}`}>{event.published ? "Published" : "Draft"}</span><span className="text-xl text-muted transition-transform group-open:rotate-45" aria-hidden>+</span></span>
          </summary>
          <div className="border-t border-line p-4 sm:p-5"><EventForm event={event} calendars={calendars} clubs={clubs} canManageMeetingEffects={canManageMeetingEffects} canDeleteClubEvent={canManageMeetingEffects}/>{event.club_id && !canManageMeetingEffects ? <p className="mt-3 rounded-control bg-content-bg p-3 text-xs text-muted">This Club-managed event can be edited here, but only an administrator can delete it.</p> : null}</div>
        </details>;
      })}
      {!filtered.length ? <div className="rounded-[16px] border border-dashed border-line p-10 text-center"><p className="font-semibold text-ink">No matching events</p><p className="mt-1 text-sm text-muted">Try a different date range or clear a filter.</p></div> : null}
    </div>
  </section>;
}
