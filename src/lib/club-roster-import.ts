import { bellPeriodByNumber } from "./bell-schedule.ts";

export const CLUB_ROSTER_REQUIRED_HEADERS = ["club", "advisor", "advisor_email", "day", "room", "period"] as const;

const headerAliases: Record<string, string> = {
  "advisor email": "advisor_email",
  "advisor e-mail": "advisor_email",
  "club name": "club",
};

const weekdays: Record<string, number> = {
  "1": 1, mon: 1, monday: 1,
  "2": 2, tue: 2, tues: 2, tuesday: 2,
  "3": 3, wed: 3, wednesday: 3,
  "4": 4, thu: 4, thur: 4, thurs: 4, thursday: 4,
  "5": 5, fri: 5, friday: 5,
  "6": 6, sat: 6, saturday: 6,
  "7": 7, sun: 7, sunday: 7,
};

export type ClubRosterPayload = {
  club: string;
  advisor: string;
  advisor_email: string;
  day: string;
  room: string;
  period: string;
  slug: string;
  description: string;
  category: string;
  school_year: string;
  status: string;
};

export function normalizeClubRosterHeaders(values: string[]) {
  return values.map((value) => {
    const normalized = value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/\s+/g, " ");
    return headerAliases[normalized] ?? normalized.replace(/\s+/g, "_");
  });
}

export function clubSlug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

export function parseClubRosterRow(headers: string[], values: string[]): { payload: ClubRosterPayload; errors: string[] } {
  const raw = Object.fromEntries(headers.map((key, index) => [key, values[index]?.trim() ?? ""]));
  const payload: ClubRosterPayload = {
    club: raw.club ?? "",
    advisor: raw.advisor ?? "",
    advisor_email: (raw.advisor_email ?? "").toLowerCase(),
    day: raw.day ?? "",
    room: raw.room ?? "",
    period: raw.period ?? "",
    slug: (raw.slug || clubSlug(raw.club ?? "")).toLowerCase(),
    description: raw.description ?? "",
    category: raw.category ?? "",
    school_year: raw.school_year ?? "",
    status: (raw.status || "published").toLowerCase(),
  };
  const errors: string[] = [];
  if (payload.club.length < 2 || payload.club.length > 120) errors.push("Club must be 2–120 characters");
  if (!payload.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(payload.slug)) errors.push("Club name cannot create a valid URL slug");
  if (payload.advisor.length < 2 || payload.advisor.length > 120) errors.push("Advisor name is required");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payload.advisor_email)) errors.push("Advisor email is invalid");
  if (!weekdays[payload.day.toLowerCase()]) errors.push("DAY must be Monday–Sunday or 1–7");
  if (!payload.room || payload.room.length > 120) errors.push("ROOM is required and must be 120 characters or less");
  if (!bellPeriodByNumber(Number(payload.period))) errors.push("Period must be 1–11");
  if (payload.description && payload.description.length > 1000) errors.push("Description is too long");
  if (payload.category.length > 100) errors.push("Category is too long");
  if (payload.school_year.length > 20) errors.push("School year is too long");
  if (!["draft", "published", "archived"].includes(payload.status)) errors.push("Status must be draft, published, or archived");
  return { payload, errors };
}

export function clubRosterMeeting(payload: ClubRosterPayload) {
  const period = bellPeriodByNumber(Number(payload.period));
  const day = weekdays[payload.day.toLowerCase()];
  return period && day ? { day_of_week: day, start_time: period.startTime, end_time: period.endTime, location: payload.room } : null;
}
