
import { bellPeriodByNumber } from "./bell-schedule.ts";

export const CLUB_ROSTER_REQUIRED_HEADERS = ["club"] as const;

const headerAliases: Record<string, string> = {
  "advisor email": "advisor_email",
  "advisor e-mail": "advisor_email",
  "club name": "club",
};

const weekdays: Record<string, number> = {
  "1": 1, mon: 1, monday: 1, mondays: 1,
  "2": 2, tue: 2, tues: 2, tuesday: 2, tuesdays: 2,
  "3": 3, wed: 3, weds: 3, wednesday: 3, wednesdays: 3,
  "4": 4, thu: 4, thur: 4, thurs: 4, thursday: 4, thursdays: 4,
  "5": 5, fri: 5, friday: 5, fridays: 5,
  "6": 6, sat: 6, saturday: 6, saturdays: 6,
  "7": 7, sun: 7, sunday: 7, sundays: 7,
};

const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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
  _import_warnings?: string[];
};

export function normalizeClubRosterHeaders(values: string[]) {
  return values.map((value) => {
    const normalized = value
      .replace(/^\uFEFF/, "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");

    return headerAliases[normalized] ??
      normalized.replace(/\s+/g, "_");
  });
}

export function clubSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

export function validAdvisorEmail(value: string) {
  return value.length <= 254 && emailPattern.test(value);
}

export function clubRosterDays(day: string): number[] {
  let normalized = day.trim().toLowerCase();
  if (!normalized) return [];

  if (
    /\b(every other|biweekly|bi-weekly|fortnightly|monthly|alternating|alternate|first|second|third|fourth|last|odd|even|as needed|tba|tbd|varies|variable|rotating)\b/.test(normalized)
  ) {
    return [];
  }

  normalized = normalized.replace(/^every\s+/, "");

  const parts = normalized
    .split(/\s*(?:,|;|\/|&|\+|\||\band\b)\s*/i)
    .filter(Boolean);

  if (!parts.length) return [];

  const days = parts.map(
    (part) => weekdays[part.replace(/\.$/, "").trim()]
  );

  return days.every(Boolean)
    ? [...new Set(days)].sort((a, b) => a - b)
    : [];
}

export function clubRosterPeriod(period: string) {
  const normalized = period.trim().toLowerCase();

  const match = normalized.match(
    /^(?:(?:period|pd|p)\s*[#.:\-]?\s*)?(\d{1,2})(?:st|nd|rd|th)?(?:\s*(?:period|pd))?$/i
  );

  return match
    ? bellPeriodByNumber(Number(match[1]))
    : null;
}

export function parseClubRosterRow(
  headers: string[],
  values: string[]
): {
  payload: ClubRosterPayload;
  errors: string[];
  warnings: string[];
} {
  const raw = Object.fromEntries(
    headers.map((key, index) => [
      key,
      values[index]?.trim() ?? "",
    ])
  );

  const errors: string[] = [];
  const warnings: string[] = [];

  const statusRaw = (raw.status || "published").toLowerCase();
  const validStatuses = ["draft", "published", "archived"];

  const status = validStatuses.includes(statusRaw)
    ? statusRaw
    : "draft";

  if (status !== statusRaw) {
    warnings.push(
      `Unknown status '${raw.status}'; imported as draft`
    );
  }

  const payload: ClubRosterPayload = {
    club: raw.club ?? "",
    advisor: (raw.advisor ?? "").slice(0, 120),
    advisor_email: (raw.advisor_email ?? "").toLowerCase(),
    day: raw.day ?? "",
    room: raw.room ?? "",
    period: raw.period ?? "",
    slug: (
      raw.slug || clubSlug(raw.club ?? "")
    ).toLowerCase(),
    description: (raw.description ?? "").slice(0, 1000),
    category: (raw.category ?? "").slice(0, 100),
    school_year: (raw.school_year ?? "").slice(0, 20),
    status,
  };

  // Only structural problems block importing.
  if (
    payload.club.length < 2 ||
    payload.club.length > 120
  ) {
    errors.push("Club must be 2–120 characters");
  }

  if (
    !payload.slug ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(payload.slug)
  ) {
    errors.push("Club name cannot create a valid URL slug");
  }

  // Everything below is informational.
  if ((raw.advisor ?? "").length > 120) {
    warnings.push("Advisor name was shortened");
  }

  if (
    payload.advisor_email &&
    !validAdvisorEmail(payload.advisor_email)
  ) {
    warnings.push(
      "Invalid Advisor email; automatic assignment skipped"
    );
  }

  if (payload.advisor && !payload.advisor_email) {
    warnings.push(
      "Advisor email missing; automatic assignment skipped"
    );
  }

  if (
    payload.day &&
    !clubRosterDays(payload.day).length
  ) {
    warnings.push(
      `Custom meeting day '${payload.day}'; no recurring meeting created`
    );
  }

  if (
    payload.period &&
    !clubRosterPeriod(payload.period)
  ) {
    warnings.push(
      `Custom Period '${payload.period}'; no fixed time assumed`
    );
  }

  return { payload, errors, warnings };
}

export function clubRosterMeetings(
  payload: ClubRosterPayload
) {
  const period = clubRosterPeriod(payload.period);

  return clubRosterDays(payload.day).map((day) => ({
    day_of_week: day,
    start_time: period?.startTime ?? null,
    end_time: period?.endTime ?? null,
    location: payload.room || null,
    recurrence_note:
      !period && payload.period
        ? `Period: ${payload.period}`
        : null,
  }));
}

export function clubRosterMeeting(
  payload: ClubRosterPayload
) {
  const meeting = clubRosterMeetings(payload)[0];

  return meeting
    ? {
        day_of_week: meeting.day_of_week,
        start_time: meeting.start_time,
        end_time: meeting.end_time,
        location: meeting.location,
      }
    : null;
}
