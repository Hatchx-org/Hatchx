"use client";

import { useActionState, useState } from "react";
import EventForm from "@/app/(hub)/admin/events/event-form";
import type { CalendarSourceRow } from "@/lib/supabase/types";
import { deleteEventsOnDate } from "./actions";

export default function CalendarAdminPanel({ calendars, clubs }: { calendars: CalendarSourceRow[]; clubs: Array<{ id: string; name: string }> }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(deleteEventsOnDate, null);
  return <section className="mt-6 overflow-hidden rounded-card border border-powder/35 bg-card shadow-sm">
    <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"><span><span className="block text-xs font-bold uppercase tracking-[.16em] text-powder">Administrator controls</span><span className="mt-1 block font-bold text-ink">Add an event or clear a date</span></span><span className="text-2xl text-muted" aria-hidden>{open ? "−" : "+"}</span></button>
    {open ? <div className="grid gap-6 border-t border-line p-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,.6fr)]">
      <div><h2 className="text-lg font-bold text-ink">Add an event</h2><p className="mb-4 mt-1 text-sm text-muted">The event appears on this page immediately when published.</p><EventForm calendars={calendars} clubs={clubs} canManageMeetingEffects /></div>
      <div className="rounded-control border border-orange/30 bg-orange/5 p-4"><h2 className="font-bold text-ink">Delete one date</h2><p className="mt-1 text-sm leading-6 text-muted">Deletes every saved event that starts on the selected New York date. Recurring Club meetings are managed by their Club schedules and are not erased.</p><form action={action} onSubmit={event => { const date = new FormData(event.currentTarget).get("date"); if (!window.confirm(`Delete all saved calendar events starting on ${date}?`)) event.preventDefault(); }} className="mt-4 grid gap-3"><input type="date" name="date" required className="h-11 rounded-control border border-line bg-content-bg px-3 text-sm text-ink"/><input type="hidden" name="confirm" value="delete-day"/><button disabled={pending} className="h-11 rounded-full border border-orange/50 px-4 text-sm font-bold text-orange disabled:opacity-50">{pending ? "Deleting…" : "Delete all events on date"}</button>{state ? <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-[#23864c]" : "text-orange"}`}>{state.message}</p> : null}</form></div>
    </div> : null}
  </section>;
}
