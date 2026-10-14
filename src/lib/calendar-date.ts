export const SCHOOL_TIME_ZONE = "America/New_York";

type DateParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: SCHOOL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function partsInNewYork(date: Date): DateParts {
  const parts = dateTimeFormatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(item => item.type === type)?.value ?? 0);
  return { year: part("year"), month: part("month"), day: part("day"), hour: part("hour"), minute: part("minute"), second: part("second") };
}

function offsetAt(date: Date) {
  const parts = partsInNewYork(date);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - date.getTime();
}

function wallClockToUtc(parts: DateParts) {
  const wallClock = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let result = new Date(wallClock);
  // A second pass handles values close to a daylight-saving boundary.
  result = new Date(wallClock - offsetAt(result));
  result = new Date(wallClock - offsetAt(result));
  const represented = partsInNewYork(result);
  return Object.entries(parts).every(([key, value]) => represented[key as keyof DateParts] === value) ? result : null;
}

/** Convert a datetime-local form value, interpreted in New York, to UTC. */
export function newYorkDateTimeToUtc(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second = "00"] = match;
  const parts = { year: Number(year), month: Number(month), day: Number(day), hour: Number(hour), minute: Number(minute), second: Number(second) };
  if (parts.month < 1 || parts.month > 12 || parts.hour > 23 || parts.minute > 59 || parts.second > 59) return undefined;
  const result = wallClockToUtc(parts);
  return result?.toISOString();
}

/** Calendar date key for a UTC instant as observed in New York. */
export function newYorkDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  const { year, month, day } = partsInNewYork(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Value suitable for a datetime-local input, always in the school time zone. */
export function newYorkDateTimeInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const { year, month, day, hour, minute } = partsInNewYork(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** UTC range covering one complete calendar date in America/New_York. */
export function newYorkDayBounds(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [year, month, day] = date.split("-").map(Number);
  const requested = new Date(Date.UTC(year, month - 1, day));
  if (requested.getUTCFullYear() !== year || requested.getUTCMonth() !== month - 1 || requested.getUTCDate() !== day) return null;
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const start = wallClockToUtc({ year, month, day, hour: 0, minute: 0, second: 0 });
  const end = wallClockToUtc({ year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate(), hour: 0, minute: 0, second: 0 });
  return start && end ? { start: start.toISOString(), end: end.toISOString() } : null;
}
