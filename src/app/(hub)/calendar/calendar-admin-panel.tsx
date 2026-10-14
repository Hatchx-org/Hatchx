"use client";

import { useState } from "react";
import EventForm from "@/app/(hub)/admin/events/event-form";
import type { CalendarSourceRow } from "@/lib/supabase/types";

export default function CalendarAdminPanel({ calendars, clubs }: { calendars: CalendarSourceRow[]; clubs: Array<{ id: string; name: string }> }) {
  const [open, setOpen] = useState(false);
  return <section className="mt-6 overflow-hidden rounded-card border border-powder/35 bg-card shadow-sm">
    <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"><span><span className="block text-xs font-bold uppercase tracking-[.16em] text-powder">Administrator controls</span><span className="mt-1 block font-bold text-ink">Add an event</span></span><span className="text-2xl text-muted" aria-hidden>{open ? "−" : "+"}</span></button>
    {open ? <div className="border-t border-line p-5">
      <div className="max-w-3xl"><h2 className="text-lg font-bold text-ink">Add an event</h2><p className="mb-4 mt-1 text-sm text-muted">The event appears on this page immediately when published. To manage one date, select that day in the calendar.</p><EventForm calendars={calendars} clubs={clubs} canManageMeetingEffects /></div>
    </div> : null}
  </section>;
}
