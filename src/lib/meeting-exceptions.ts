import { newYorkDateKey } from "./calendar-date.ts";

export type MeetingException = {
  start_at: string;
  end_at: string | null;
  meeting_effect?: "none" | "all" | "club";
  affected_club_id?: string | null;
};

/** True when a published calendar exception removes a recurring Club meeting. */
export function isMeetingSuppressed(dateISO: string, clubId: string, exceptions: MeetingException[]) {
  return exceptions.some((event) => {
    const effect = event.meeting_effect ?? "none";
    if (effect === "none" || (effect === "club" && event.affected_club_id !== clubId)) return false;
    const start = newYorkDateKey(event.start_at);
    const end = newYorkDateKey(event.end_at ?? event.start_at);
    return Boolean(start && end && dateISO >= start && dateISO <= end);
  });
}
