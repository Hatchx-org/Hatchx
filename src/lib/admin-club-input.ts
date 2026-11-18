import { parseOptionalDateOnly } from "./input-validation.ts";

export const clubStatuses = ["draft", "published", "archived"] as const;
export const recruitingStatuses = ["recruiting", "paused", "closed"] as const;

function optional(value: FormDataEntryValue | null, max: number) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length <= max ? text || null : undefined;
}

function time(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return !text || /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text || null : undefined;
}

export function parseAdminClubInput(formData: FormData) {
  const name = String(formData.get("name") ?? "").replace(/\s+/g, " ").trim();
  const shortDescription = String(formData.get("short_description") ?? "").trim();
  const category = String(formData.get("category") ?? "").replace(/\s+/g, " ").trim();
  const contactEmail = optional(formData.get("contact_email"), 254);
  const status = String(formData.get("status") ?? "draft");
  const recruitingStatus = String(formData.get("recruiting_status") ?? "recruiting");
  const joinPolicy = String(formData.get("join_policy") ?? "approval_required");
  const activeStartDate = parseOptionalDateOnly(String(formData.get("active_start_date") ?? ""));
  const activeEndDate = parseOptionalDateOnly(String(formData.get("active_end_date") ?? ""));
  const dayValue = String(formData.get("meeting_day") ?? "");
  const meetingDay = dayValue ? Number(dayValue) : null;
  const startTime = time(formData.get("start_time"));
  const endTime = time(formData.get("end_time"));
  const location = optional(formData.get("location"), 160);

  if (name.length < 2 || name.length > 120 || shortDescription.length < 10 || shortDescription.length > 1000) return null;
  if (category.length < 2 || category.length > 30 || contactEmail === undefined || (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))) return null;
  if (!clubStatuses.includes(status as (typeof clubStatuses)[number]) || !recruitingStatuses.includes(recruitingStatus as (typeof recruitingStatuses)[number])) return null;
  if (!['instant', 'approval_required'].includes(joinPolicy) || activeStartDate === undefined || activeEndDate === undefined || (activeStartDate && activeEndDate && activeEndDate < activeStartDate)) return null;
  if (meetingDay !== null && (!Number.isInteger(meetingDay) || meetingDay < 1 || meetingDay > 7)) return null;
  if (startTime === undefined || endTime === undefined || location === undefined || (startTime && endTime && endTime <= startTime)) return null;

  return {
    name,
    shortDescription,
    category,
    contactEmail,
    status: status as (typeof clubStatuses)[number],
    recruitingStatus: recruitingStatus as (typeof recruitingStatuses)[number],
    joinPolicy: joinPolicy as "instant" | "approval_required",
    activeStartDate,
    activeEndDate,
    meeting: meetingDay === null ? null : { dayOfWeek: meetingDay, startTime, endTime, location },
  };
}
