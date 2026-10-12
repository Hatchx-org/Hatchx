import { getEvents } from "@/lib/events";

function escapeIcs(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll(",", "\\,").replaceAll(";", "\\;");
}

function dateValue(value: string) {
  return value.replaceAll("-", "");
}

function dayAfter(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export async function GET() {
  const events = await getEvents();
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const entries = events.filter((event) => event.dateISO).map((event) => [
    "BEGIN:VEVENT",
    `UID:${escapeIcs(`${event.id}@hatchx`)}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${dateValue(event.dateISO!)}`,
    `DTEND;VALUE=DATE:${dateValue(dayAfter(event.dateEndISO ?? event.dateISO!))}`,
    `SUMMARY:${escapeIcs(`${event.meetingEffect ? "NO MEETINGS — " : ""}${event.title}`)}`,
    `DESCRIPTION:${escapeIcs(event.meetingEffect === "club" && event.affectedClubName ? `${event.description}\n${event.affectedClubName} meeting cancelled` : event.meetingEffect === "all" ? `${event.description}\nAll Club meetings cancelled` : `${event.description}\nTime: ${event.time}`)}`,
    `LOCATION:${escapeIcs(event.meetingEffect ? "" : event.location)}`,
    "END:VEVENT",
  ].join("\r\n"));
  const calendar = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Hatchx//School Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Hatchx",
    "X-WR-CALDESC:Bayside High School clubs, activities, sports, and events",
    ...entries,
    "END:VCALENDAR",
    "",
  ].join("\r\n");

  return new Response(calendar, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="hatchx-calendar.ics"',
      "Cache-Control": "public, max-age=300",
    },
  });
}
