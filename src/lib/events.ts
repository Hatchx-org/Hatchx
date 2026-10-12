import { cache } from "react";
import { events as seedEvents, type EventItem } from "./data";
import { isSupabaseConfigured } from "./supabase/config";
import { createServerClient } from "./supabase/server";
import type { CalendarSourceRow, EventRow } from "./supabase/types";
import { developmentFallback, normalizeRecordId } from "./live-data";
import { isMeetingSuppressed } from "./meeting-exceptions";

function formatDate(startAt: string, endAt: string | null) {
  const start = new Date(startAt);
  const end = endAt ? new Date(endAt) : null;
  const formatter = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });
  return end && start.toDateString() !== end.toDateString()
    ? `${formatter.format(start)} – ${formatter.format(end)}`
    : formatter.format(start);
}

function mapEvent(row: EventRow, calendars = new Map<string, CalendarSourceRow>(), clubNames = new Map<string, string>()): EventItem {
  const start = new Date(row.start_at);
  const end = row.end_at ? new Date(row.end_at) : null;
  const calendar = row.calendar_id ? calendars.get(row.calendar_id) : undefined;
  return {
    id: normalizeRecordId(row.id),
    title: row.title,
    category: row.event_type === "sports" ? "sports" : row.event_type === "spirit_week" ? "spirit-week" : "events",
    date: formatDate(row.start_at, row.end_at),
    dateISO: row.start_at.slice(0, 10),
    dateEndISO: row.end_at?.slice(0, 10),
    time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(start)
      + (end ? ` – ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(end)}` : ""),
    location: row.location ?? "Location TBA",
    price: row.price_label,
    description: row.description,
    source: row.event_type === "club" ? "club" : row.event_type === "sports" ? "sports" : "school",
    calendarId: calendar?.id,
    calendarName: calendar?.name,
    calendarColor: calendar?.color,
    meetingEffect: row.meeting_effect === "all" || row.meeting_effect === "club" ? row.meeting_effect : undefined,
    affectedClubName: row.affected_club_id ? clubNames.get(row.affected_club_id) : undefined,
  };
}

function meetingEvents(
  meetings: { id: string; club_id: string; day_of_week: number; start_time: string | null; end_time: string | null; location: string | null; recurrence_note: string | null }[],
  clubs: { id: string; slug: string; name: string; active_start_date: string | null; active_end_date: string | null }[],
  exceptions: EventRow[],
): EventItem[] {
  const clubsById = new Map(clubs.map((club) => [club.id, club]));
  const start = new Date();
  start.setDate(start.getDate() - 35);
  const end = new Date();
  end.setDate(end.getDate() + 120);
  const output: EventItem[] = [];
  for (const meeting of meetings) {
    const club = clubsById.get(meeting.club_id);
    if (!club) continue;
    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    while (cursor <= end) {
      const isoDay = cursor.getDay() === 0 ? 7 : cursor.getDay();
      const dateISO = [cursor.getFullYear(), String(cursor.getMonth() + 1).padStart(2, "0"), String(cursor.getDate()).padStart(2, "0")].join("-");
      if (
        isoDay === meeting.day_of_week
        && (!club.active_start_date || dateISO >= club.active_start_date)
        && (!club.active_end_date || dateISO <= club.active_end_date)
        && !isMeetingSuppressed(dateISO, club.id, exceptions)
      ) {
        output.push({
          id: `meeting-${meeting.id}-${dateISO}`,
          title: `${club.name} Meeting`,
          category: "events",
          date: new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(cursor),
          dateISO,
          time: `${shortTime(meeting.start_time)}${meeting.end_time ? ` – ${shortTime(meeting.end_time)}` : ""}` || "Time TBA",
          location: meeting.location ?? "Location TBA",
          price: "Free",
          description: meeting.recurrence_note ?? `Regular meeting for ${club.name}.`,
          source: "club",
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return output;
}

function shortTime(value: string | null) {
  if (!value) return "";
  const [hoursText, minutes = "00"] = value.split(":");
  const hours = Number(hoursText);
  return `${hours % 12 || 12}:${minutes} ${hours >= 12 ? "PM" : "AM"}`;
}

export const getEvents = cache(async (limit?: number): Promise<EventItem[]> => {
  if (!isSupabaseConfigured()) {
    const demoEvents = developmentFallback(seedEvents);
    return limit === undefined ? demoEvents : demoEvents.slice(0, limit);
  }
  const supabase = await createServerClient();
  let query = supabase
    .from("events")
    .select("*")
    .eq("published", true)
    .order("start_at");
  if (limit !== undefined) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw new Error(`Unable to load events: ${error.message}`);
  const [meetingResult, clubResult, calendarResult] = await Promise.all([
    supabase.from("club_meetings").select("id, club_id, day_of_week, start_time, end_time, location, recurrence_note"),
    supabase.from("clubs").select("id, slug, name, active_start_date, active_end_date").eq("status", "published"),
    supabase.from("calendar_sources").select("*").eq("active", true),
  ]);
  const calendars = new Map((calendarResult.data ?? []).map(calendar => [calendar.id, calendar]));
  const clubNames = new Map((clubResult.data ?? []).map(club => [club.id, club.name]));
  const liveRows = (data ?? []).filter(row => !row.calendar_id || calendars.has(row.calendar_id));
  const live = liveRows.map(row => mapEvent(row, calendars, clubNames));
  const recurring = meetingResult.error || clubResult.error
    ? []
    : meetingEvents(meetingResult.data ?? [], clubResult.data ?? [], liveRows);
  const output = [...live, ...recurring];
  return limit === undefined ? output : output.slice(0, limit);
});

export async function getEvent(id: string) {
  return (await getEvents()).find((event) => event.id === id) ?? null;
}
