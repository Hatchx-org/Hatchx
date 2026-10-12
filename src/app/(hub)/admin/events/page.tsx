import { PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/permissions";
import { createServerClient } from "@/lib/supabase/server";
import CalendarManager from "./calendar-manager";
import EventForm from "./event-form";
import EventManager from "./event-manager";

export default async function AdminEventsPage() {
  const user = await requirePermission("events.manage", "/admin/events");
  const db = await createServerClient();
  const [{ data: events, error }, calendarResult, clubResult] = await Promise.all([
    db.from("events").select("*").order("start_at", { ascending: false }).limit(150),
    db.from("calendar_sources").select("*").order("name"),
    db.from("clubs").select("id,name").order("name"),
  ]);
  const calendars = calendarResult.data ?? [];
  const clubs = clubResult.data ?? [];
  const eventCounts = (events ?? []).reduce<Record<string, number>>((counts, event) => {
    if (event.calendar_id) counts[event.calendar_id] = (counts[event.calendar_id] ?? 0) + 1;
    return counts;
  }, {});

  return <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
    <PageHeader title="Calendar control center" subtitle="Add an event in seconds, then search and edit everything from one page."/>
    {calendarResult.error ? <p role="alert" className="mt-6 rounded-card border border-orange/40 bg-card p-5 text-sm">Custom calendars require <code>supabase/schema.sql</code>.</p> : null}
    {error ? <p role="alert" className="mt-6 rounded-card border border-orange/40 bg-card p-5">Events could not be loaded. Verify the core platform migration and Staff access.</p> : <div className="mt-7 grid gap-6">
      <section className="rounded-card border border-line bg-card p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-2"><div><h2 className="text-xl font-bold text-ink">Quick add</h2><p className="mt-1 text-sm text-muted">Only the name and start time are required.</p></div><span className="rounded-full bg-content-bg px-3 py-1 text-xs font-semibold text-muted">New events are public by default</span></div>
        <EventForm calendars={calendars} clubs={clubs} canManageMeetingEffects={user.role === "admin"}/>
      </section>
      <EventManager events={events ?? []} calendars={calendars} clubs={clubs} canManageMeetingEffects={user.role === "admin"} now={new Date().toISOString()}/>
      {user.role === "admin" && !calendarResult.error ? <CalendarManager calendars={calendars} eventCounts={eventCounts}/> : null}
    </div>}
  </div>;
}
