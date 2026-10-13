"use client";

import { useActionState, useState } from "react";
import type { CalendarSourceRow, EventRow } from "@/lib/supabase/types";
import { deleteEvent, saveEvent } from "../actions";

const field = "h-11 w-full rounded-control border border-black/10 bg-content-bg px-3 text-sm text-ink outline-none focus:border-navy focus:ring-2 focus:ring-navy/10";

function localDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function EventForm({ event, calendars = [], clubs = [], canManageMeetingEffects = false, canDeleteClubEvent = false }: {
  event?: EventRow;
  calendars?: CalendarSourceRow[];
  clubs?: Array<{ id: string; name: string }>;
  canManageMeetingEffects?: boolean;
  canDeleteClubEvent?: boolean;
}) {
  const [state, action, pending] = useActionState(saveEvent, null);
  const [deleteState, deleteAction, deleting] = useActionState(deleteEvent, null);
  const [startAt, setStartAt] = useState(localDateTime(event?.start_at ?? null));
  const [endAt, setEndAt] = useState(localDateTime(event?.end_at ?? null));
  const [meetingEffect, setMeetingEffect] = useState(event?.meeting_effect ?? "none");

  return <div>
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={event?.id ?? ""}/>
      <label className="grid gap-1.5 text-sm font-semibold text-ink">Event name<input name="title" required minLength={3} maxLength={160} defaultValue={event?.title} placeholder="e.g. College Night" className={field}/></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-semibold text-ink">Starts<input type="datetime-local" required value={startAt} onChange={e=>setStartAt(e.target.value)} className={field}/></label>
        <label className="grid gap-1.5 text-sm font-semibold text-ink">Ends <span className="font-normal text-muted">(optional)</span><input type="datetime-local" value={endAt} onChange={e=>setEndAt(e.target.value)} className={field}/></label>
      </div>
      <input type="hidden" name="start_at" value={startAt ? new Date(startAt).toISOString() : ""}/>
      <input type="hidden" name="end_at" value={endAt ? new Date(endAt).toISOString() : ""}/>
      <label className="flex items-center gap-2 rounded-control bg-content-bg p-3 text-sm font-semibold text-ink"><input type="checkbox" name="published" defaultChecked={event ? event.published : true}/> Show immediately on the public Calendar</label>

      <details className="rounded-control border border-line p-4" open={Boolean(event)}>
        <summary className="cursor-pointer font-semibold text-navy">More options <span className="font-normal text-muted">— location, category, details</span></summary>
        <div className="mt-4 grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-semibold text-muted">Event type<select name="event_type" defaultValue={event?.event_type ?? "school"} className={field}><option value="school">School</option><option value="sports">Sports</option><option value="festival">Festival</option><option value="other">Other</option></select></label>
            <label className="grid gap-1.5 text-xs font-semibold text-muted">Calendar<select name="calendar_id" defaultValue={event?.calendar_id ?? ""} className={field}><option value="">Main school calendar</option>{calendars.map(calendar=><option key={calendar.id} value={calendar.id}>{calendar.name}</option>)}</select></label>
          </div>
          <label className="grid gap-1.5 text-xs font-semibold text-muted">Description <span className="font-normal">(optional; event name is used if blank)</span><textarea name="description" maxLength={5000} rows={3} defaultValue={event?.description} placeholder="Helpful details for students" className={`${field} h-auto py-3`}/></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-semibold text-muted">Location<input name="location" maxLength={240} defaultValue={event?.location ?? ""} placeholder="Room, building, or online" className={field}/></label>
            <label className="grid gap-1.5 text-xs font-semibold text-muted">Price<input name="price_label" maxLength={80} defaultValue={event?.price_label ?? "Free"} placeholder="Free" className={field}/></label>
          </div>
          {canManageMeetingEffects ? <fieldset className="rounded-control border border-orange/25 bg-orange/5 p-3"><legend className="px-1 text-xs font-bold uppercase tracking-wide text-muted">Club meeting impact</legend><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-muted">Meeting status<select name="meeting_effect" value={meetingEffect} onChange={change => setMeetingEffect(change.target.value as "none" | "all" | "club")} className={`${field} mt-1`}><option value="none">Regular calendar event</option><option value="all">No Club meetings — all Clubs</option><option value="club">Cancel one Club&apos;s meeting</option></select></label>{meetingEffect === "club" ? <label className="text-xs font-semibold text-muted">Affected Club<select name="affected_club_id" required defaultValue={event?.affected_club_id ?? ""} className={`${field} mt-1`}><option value="">Choose Club</option>{clubs.map(club => <option key={club.id} value={club.id}>{club.name}</option>)}</select></label> : <input type="hidden" name="affected_club_id" value=""/>}</div><p className="mt-2 text-xs leading-5 text-muted">Use this only for official closures or cancellations.</p></fieldset> : <><input type="hidden" name="meeting_effect" value={event?.meeting_effect ?? "none"}/><input type="hidden" name="affected_club_id" value={event?.affected_club_id ?? ""}/>{event?.meeting_effect && event.meeting_effect !== "none" ? <p className="text-xs font-semibold text-orange">Only an administrator can change this meeting cancellation.</p> : null}</>}
        </div>
      </details>

      {state ? <p role={state.ok ? "status" : "alert"} className={`rounded-control p-3 text-sm ${state.ok ? "bg-[#23864c]/10 text-[#176b35]" : "bg-orange/10 text-orange"}`}>{state.message}</p> : null}
      <button disabled={pending} className="h-11 rounded-full bg-navy px-5 font-bold text-cream disabled:opacity-50">{pending ? "Saving…" : event ? "Save changes" : "Add to Calendar"}</button>
    </form>

    {event && (!event.club_id || canDeleteClubEvent) ? <form action={deleteAction} onSubmit={(submitEvent) => { if (!window.confirm(`Permanently delete “${event.title}”?`)) submitEvent.preventDefault(); }} className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4"><input type="hidden" name="id" value={event.id}/><input type="hidden" name="confirm" value="delete"/><p className="min-w-0 flex-1 text-xs text-muted">Deletion is permanent{event.club_id ? " and removes this Club-owned event" : ""}.</p><button disabled={deleting} className="rounded-full border border-orange/40 px-4 py-2 text-xs font-bold text-orange">{deleting ? "Deleting…" : "Delete event"}</button>{deleteState ? <span role={deleteState.ok ? "status" : "alert"} className="basis-full text-xs text-muted">{deleteState.message}</span> : null}</form> : null}
  </div>;
}
