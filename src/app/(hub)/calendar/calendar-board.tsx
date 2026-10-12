"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { EventItem } from "@/lib/data";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function Arrow({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
      <path
        d={dir === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Events happening on a given day (inclusive of multi-day ranges). */
function eventsOn(events: EventItem[], year: number, month: number, day: number) {
  const cell = new Date(Date.UTC(year, month, day));
  return events.filter((e) => {
    if (!e.dateISO) return false;
    const start = new Date(e.dateISO + "T00:00:00Z");
    const end = e.dateEndISO ? new Date(e.dateEndISO + "T00:00:00Z") : start;
    return cell >= start && cell <= end;
  });
}

export default function CalendarBoard({ events }: { events: EventItem[] }) {
  // Open on the current month; users can navigate back to archived events.
  const defaultMonth = useMemo(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  }, []);

  const [cursor, setCursor] = useState(defaultMonth);
  const [layer, setLayer] = useState("all");
  const [view, setView] = useState<"auto" | "month" | "list">("auto");
  const customCalendars = useMemo(() => Array.from(new Map(events.filter(event => event.calendarId).map(event => [event.calendarId!, { id: event.calendarId!, name: event.calendarName ?? "Calendar", color: event.calendarColor ?? "#263A99" }])).values()), [events]);
  const visibleEvents = useMemo(
    () => layer === "all" ? events : layer.startsWith("calendar:") ? events.filter(event => event.calendarId === layer.slice(9)) : events.filter((event) => (event.source ?? (event.category === "sports" ? "sports" : "school")) === layer),
    [events, layer],
  );
  const monthEvents = useMemo(
    () => visibleEvents
      .filter((event) => {
        if (!event.dateISO) return false;
        const date = new Date(`${event.dateISO}T00:00:00`);
        return date.getFullYear() === cursor.year && date.getMonth() === cursor.month;
      })
      .sort((a, b) => `${a.dateISO}${a.time}`.localeCompare(`${b.dateISO}${b.time}`)),
    [visibleEvents, cursor],
  );

  const cells = useMemo(() => {
    const first = new Date(Date.UTC(cursor.year, cursor.month, 1));
    const daysInMonth = new Date(Date.UTC(cursor.year, cursor.month + 1, 0)).getUTCDate();
    const leading = (first.getUTCDay() + 6) % 7; // Monday-first offset
    const out: (number | null)[] = Array.from({ length: leading }, () => null);
    for (let d = 1; d <= daysInMonth; d++) out.push(d);
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [cursor]);

  const move = (delta: number) => {
    setCursor((c) => {
      const next = new Date(Date.UTC(c.year, c.month + delta, 1));
      return { year: next.getUTCFullYear(), month: next.getUTCMonth() };
    });
  };

  const today = new Date();
  const isThisMonth =
    today.getFullYear() === cursor.year && today.getMonth() === cursor.month;

  return (
    <section className="theme-fixed-dark overflow-hidden rounded-[18px] bg-black">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Calendar layers">
          {(["all", "school", "club", "sports"] as const).map((value) => (
            <button key={value} type="button" aria-pressed={layer === value} onClick={() => setLayer(value)} className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${layer === value ? "bg-cream text-black" : "border border-line text-cream"}`}>{value}</button>
          ))}
          {customCalendars.map(calendar => <button key={calendar.id} type="button" aria-pressed={layer === `calendar:${calendar.id}`} onClick={() => setLayer(`calendar:${calendar.id}`)} className={`rounded-full px-3 py-1 text-xs font-semibold ${layer === `calendar:${calendar.id}` ? "bg-cream text-black" : "border border-line text-cream"}`}><span className="mr-1.5 inline-block size-2 rounded-full" style={{backgroundColor:calendar.color}}/>{calendar.name}</button>)}
        </div>
        <div className="flex rounded-full border border-line" role="group" aria-label="Calendar view">
          {(["month", "list"] as const).map((value) => (
            <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value)} className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${view === value ? "bg-powder text-black" : "text-cream"}`}>{value}</button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between border-b border-line px-6 py-5">
        <h2 className="font-display text-2xl font-medium text-cream sm:text-3xl">
          {MONTH_NAMES[cursor.month]} {cursor.year}
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => move(-1)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-line text-[#B5BEC6] transition-colors hover:bg-cream/10 hover:text-cream"
          >
            <Arrow dir="left" />
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => move(1)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-line text-[#B5BEC6] transition-colors hover:bg-cream/10 hover:text-cream"
          >
            <Arrow dir="right" />
          </button>
        </div>
      </div>
      <div className={view === "list" ? "hidden" : view === "auto" ? "hidden sm:block" : "block"}>
        <div className="grid grid-cols-7 border-b border-line bg-black/40 text-center text-xs font-bold uppercase tracking-wider text-muted">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
          const dayEvents = day ? eventsOn(visibleEvents, cursor.year, cursor.month, day) : [];
          const isToday = isThisMonth && day === today.getDate();
          return (
            <div
              key={i}
              className={`flex min-h-24 flex-col gap-1 border-b border-r border-line p-2 ${
                dayEvents.length > 0 ? "bg-azure/25" : ""
              }`}
            >
              {day && (
                <span
                  className={`text-xs font-semibold ${
                    isToday
                      ? "flex h-5 w-5 items-center justify-center rounded-full bg-cream text-black"
                      : "text-cream/70"
                  }`}
                >
                  {day}
                </span>
              )}
              {dayEvents.slice(0, 2).map((e) => (
                <Link
                  key={e.id}
                  href={`/events/${e.id}`}
                  className={`truncate rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-4 text-cream transition-colors hover:opacity-80 ${e.meetingEffect ? "bg-red-700" : "bg-navy"}`}
                  style={!e.meetingEffect && e.calendarColor ? { backgroundColor: e.calendarColor } : undefined}
                >
                  {e.meetingEffect ? "NO MEETINGS · " : ""}{e.title}
                </Link>
              ))}
              {dayEvents.length > 2 && (
                <span className="text-[10px] font-semibold text-powder">
                  +{dayEvents.length - 2} more
                </span>
              )}
            </div>
          );
          })}
        </div>
      </div>
      <div className={`${view === "month" ? "hidden" : view === "auto" ? "block sm:hidden" : "block"} divide-y divide-line`}>
          {monthEvents.length ? monthEvents.map((event) => (
            <Link key={event.id} href={`/events/${event.id}`} className={`flex gap-4 px-5 py-4 transition-colors sm:px-6 ${event.meetingEffect ? "bg-red-950/40 hover:bg-red-950/60" : "hover:bg-cream/5"}`}>
              <time className="w-16 shrink-0 text-sm font-bold text-powder">
                {event.dateISO ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${event.dateISO}T00:00:00`)) : "TBA"}
              </time>
              <span className="min-w-0">
                {event.meetingEffect ? <span className="mb-1 inline-flex rounded-full bg-red-700 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">No meetings</span> : null}
                <span className="block font-semibold text-cream">{event.title}</span>
                <span className="mt-1 block text-sm text-muted">{event.meetingEffect === "club" && event.affectedClubName ? `${event.affectedClubName} meeting cancelled` : event.meetingEffect === "all" ? "All Club meetings cancelled" : `${event.time} · ${event.location}`}</span>
              </span>
            </Link>
          )) : (
            <p className="px-6 py-10 text-center text-sm text-muted">No events in this month for the selected layer.</p>
          )}
      </div>
    </section>
  );
}
