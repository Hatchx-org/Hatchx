"use client";

import { useActionState } from "react";
import type { CalendarSourceRow } from "@/lib/supabase/types";
import { createCalendar, deleteCalendar, importCalendarCsv, setCalendarActive } from "../actions";

const field = "h-11 w-full rounded-control border border-line bg-content-bg px-3 text-sm text-ink outline-none focus:border-navy focus:ring-2 focus:ring-navy/10";

function CalendarRow({ calendar, eventCount }: { calendar: CalendarSourceRow; eventCount: number }) {
  const [toggleState, toggleAction, toggling] = useActionState(setCalendarActive, null);
  const [deleteState, deleteAction, deleting] = useActionState(deleteCalendar, null);
  return <div className="rounded-control border border-line bg-content-bg p-4">
    <div className="flex items-center gap-3">
      <span className="size-4 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: calendar.color }}/>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-ink">{calendar.name}</span><span className="text-xs text-muted">{eventCount} event{eventCount === 1 ? "" : "s"} · {calendar.active ? "Visible" : "Hidden"}</span></span>
      <form action={toggleAction}><input type="hidden" name="id" value={calendar.id}/><input type="hidden" name="active" value={calendar.active ? "false" : "true"}/><button disabled={toggling} className="rounded-full border border-navy/20 px-3 py-1.5 text-xs font-bold text-navy disabled:opacity-50">{toggling ? "Saving…" : calendar.active ? "Hide" : "Show"}</button></form>
      {eventCount === 0 ? <form action={deleteAction} onSubmit={(submitEvent) => { if (!window.confirm(`Delete the empty calendar “${calendar.name}”?`)) submitEvent.preventDefault(); }}><input type="hidden" name="id" value={calendar.id}/><input type="hidden" name="confirm" value="delete"/><button disabled={deleting} aria-label={`Delete ${calendar.name}`} className="rounded-full px-2 py-1.5 text-xs font-bold text-orange hover:bg-orange/10 disabled:opacity-50">{deleting ? "…" : "Delete"}</button></form> : null}
    </div>
    {eventCount > 0 ? <p className="mt-2 text-xs text-muted">Move or delete its events before deleting this calendar.</p> : null}
    {toggleState ? <p className="mt-2 text-xs text-muted">{toggleState.message}</p> : null}
    {deleteState ? <p role={deleteState.ok ? "status" : "alert"} className="mt-2 text-xs text-muted">{deleteState.message}</p> : null}
  </div>;
}

export default function CalendarManager({ calendars, eventCounts }: { calendars: CalendarSourceRow[]; eventCounts: Record<string, number> }) {
  const [createState, createAction, creating] = useActionState(createCalendar, null);
  const [importState, importAction, importing] = useActionState(importCalendarCsv, null);
  return <section className="rounded-card border border-line bg-card p-5 sm:p-6">
    <h2 className="text-xl font-bold text-ink">Calendar settings</h2><p className="mt-1 text-sm text-muted">Use separate colors for sports, exams, holidays, or other schedules.</p>
    {calendars.length ? <div className="mt-5 grid gap-2 lg:grid-cols-2">{calendars.map(calendar => <CalendarRow key={calendar.id} calendar={calendar} eventCount={eventCounts[calendar.id] ?? 0}/>)}</div> : <p className="mt-5 rounded-control bg-content-bg p-4 text-sm text-muted">No custom calendars yet. Events will use the main school calendar.</p>}
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <details className="rounded-control border border-line p-4"><summary className="cursor-pointer font-bold text-navy">+ Add a calendar</summary><form action={createAction} className="mt-4 grid gap-3"><input name="name" required minLength={2} maxLength={80} placeholder="Calendar name" className={field}/><textarea name="description" maxLength={500} rows={2} placeholder="Description (optional)" className={`${field} h-auto py-2`}/><label className="flex items-center gap-3 text-sm font-semibold text-ink">Color<input name="color" type="color" defaultValue="#263A99" className="h-10 w-16 rounded border border-line"/></label>{createState ? <p role={createState.ok ? "status" : "alert"} className="text-sm text-muted">{createState.message}</p> : null}<button disabled={creating} className="h-10 rounded-full bg-navy px-5 font-bold text-cream disabled:opacity-50">{creating ? "Creating…" : "Create calendar"}</button></form></details>
      <details className="rounded-control border border-line p-4"><summary className="cursor-pointer font-bold text-navy">Import a CSV file</summary><form action={importAction} className="mt-4 grid gap-3"><select name="calendar_id" required className={field}><option value="">Choose calendar</option>{calendars.map(calendar => <option key={calendar.id} value={calendar.id}>{calendar.name}</option>)}</select><input name="csv" type="file" accept=".csv,text/csv" required className="block w-full text-sm text-muted file:mr-3 file:rounded-full file:border-0 file:bg-content-bg file:px-4 file:py-2 file:font-semibold file:text-ink"/><p className="text-xs leading-5 text-muted">Required: <code>title,start_at</code>. Optional: <code>end_at,description,event_type,location,price_label,published</code>.</p>{importState ? <p role={importState.ok ? "status" : "alert"} className="text-sm text-muted">{importState.message}</p> : null}<button disabled={importing || !calendars.length} className="h-10 rounded-full border border-navy px-5 font-bold text-navy disabled:opacity-50">{importing ? "Importing…" : "Import events"}</button></form></details>
    </div>
  </section>;
}
