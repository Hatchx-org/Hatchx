import { bellPeriodByNumber } from "./bell-schedule.ts";

/** Share limits between create and edit so updates cannot bypass validation. */
export function parseMeetingInput(form: FormData) {
  const day = Number(form.get("day_of_week"));
  const period = Number(form.get("period"));
  const location = String(form.get("location") ?? "").trim();
  const note = String(form.get("recurrence_note") ?? "").trim();
  const selectedPeriod = bellPeriodByNumber(period);
  if (!Number.isInteger(day) || day < 1 || day > 7 || !selectedPeriod || location.length > 240 || note.length > 500) return null;
  return { day_of_week: day, start_time: selectedPeriod.startTime, end_time: selectedPeriod.endTime, location: location || null, recurrence_note: note || null };
}

export function parseClubPostInput(form: FormData) {
  const title = String(form.get("title") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  if (title.length < 3 || title.length > 120 || body.length < 3 || body.length > 4000) return null;
  return { title, body };
}
