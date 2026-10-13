function newYorkMidnightUtc(localDate: Date) {
  // Probe the target wall-clock value itself. On DST transition days, noon
  // may use a different offset than midnight.
  const probe = localDate;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(probe);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(item => item.type === type)?.value ?? 0);
  const representedUtc = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
  return new Date(localDate.getTime() - (representedUtc - probe.getTime()));
}

/** UTC range covering one complete calendar date in America/New_York. */
export function newYorkDayBounds(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [year, month, day] = date.split("-").map(Number);
  const requested = new Date(Date.UTC(year, month - 1, day));
  if (requested.getUTCFullYear() !== year || requested.getUTCMonth() !== month - 1 || requested.getUTCDate() !== day) return null;
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return { start: newYorkMidnightUtc(requested).toISOString(), end: newYorkMidnightUtc(next).toISOString() };
}
