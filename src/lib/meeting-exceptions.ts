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
    const start = event.start_at.slice(0, 10);
    const end = (event.end_at ?? event.start_at).slice(0, 10);
    return dateISO >= start && dateISO <= end;
  });
}
