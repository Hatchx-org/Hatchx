export const announcementTags = [
  "Announcements",
  "Events",
  "Clubs",
  "Sports",
  "Opportunities",
] as const;

export function parseOptionalIsoDateTime(value: string): string | null | undefined {
  const normalized = value.trim();
  if (!normalized) return null;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function parseOptionalDateOnly(value: string): string | null | undefined {
  const normalized = value.trim();
  if (!normalized) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) return undefined;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.getUTCFullYear() === Number(year)
    && date.getUTCMonth() === Number(month) - 1
    && date.getUTCDate() === Number(day)
    ? normalized
    : undefined;
}

export function isValidOptionalTime(value: string): boolean {
  return value === "" || /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value);
}
