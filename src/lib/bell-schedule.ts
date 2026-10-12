export const BAYSIDE_TIME_ZONE = "America/New_York";

export const bellPeriods = [
  { period: 1, start: "7:10 AM", end: "7:57 AM", startMinutes: 430, endMinutes: 477, length: 47, bathroom: "7:20–7:45 AM" },
  { period: 2, start: "8:00 AM", end: "8:47 AM", startMinutes: 480, endMinutes: 527, length: 47, bathroom: "8:10–8:35 AM" },
  { period: 3, start: "8:50 AM", end: "9:39 AM", startMinutes: 530, endMinutes: 579, length: 49, bathroom: "9:00–9:30 AM" },
  { period: 4, start: "9:42 AM", end: "10:29 AM", startMinutes: 582, endMinutes: 629, length: 47, bathroom: "9:52–10:20 AM" },
  { period: 5, start: "10:32 AM", end: "11:19 AM", startMinutes: 632, endMinutes: 679, length: 47, bathroom: "10:42–11:10 AM" },
  { period: 6, start: "11:22 AM", end: "12:09 PM", startMinutes: 682, endMinutes: 729, length: 47, bathroom: "11:32 AM–12:00 PM" },
  { period: 7, start: "12:12 PM", end: "12:59 PM", startMinutes: 732, endMinutes: 779, length: 47, bathroom: "12:22–12:50 PM" },
  { period: 8, start: "1:02 PM", end: "1:51 PM", startMinutes: 782, endMinutes: 831, length: 49, bathroom: "1:12–1:40 PM" },
  { period: 9, start: "1:54 PM", end: "2:41 PM", startMinutes: 834, endMinutes: 881, length: 47, bathroom: "2:05–2:30 PM" },
  { period: 10, start: "2:44 PM", end: "3:31 PM", startMinutes: 884, endMinutes: 931, length: 47, bathroom: "2:55–3:20 PM" },
  { period: 11, start: "3:34 PM", end: "4:21 PM", startMinutes: 934, endMinutes: 981, length: 47, bathroom: "3:45–4:10 PM" },
] as const;

export function bellPeriodByNumber(period: number) {
  const item = bellPeriods.find((candidate) => candidate.period === period);
  if (!item) return null;
  const toSqlTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00`;
  return { ...item, startTime: toSqlTime(item.startMinutes), endTime: toSqlTime(item.endMinutes) };
}

export function bellPeriodFromStartTime(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.slice(0, 5);
  return bellPeriods.find((item) => {
    const hour = Math.floor(item.startMinutes / 60);
    const minute = item.startMinutes % 60;
    return normalized === `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }) ?? null;
}

export function getCurrentBellPeriod(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BAYSIDE_TIME_ZONE,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const weekday = value("weekday");
  if (weekday === "Sat" || weekday === "Sun") return null;
  const minutes = Number(value("hour")) * 60 + Number(value("minute"));
  return bellPeriods.find((item) => minutes >= item.startMinutes && minutes < item.endMinutes) ?? null;
}

function getNewYorkClock(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BAYSIDE_TIME_ZONE,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return {
    weekday: value("weekday"),
    hour: Number(value("hour")),
    minutes: Number(value("hour")) * 60 + Number(value("minute")),
  };
}

export function getTimeOfDayGreeting(now: Date) {
  const { hour } = getNewYorkClock(now);
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function getSchoolDayStatus(now: Date) {
  const period = getCurrentBellPeriod(now);
  if (period) return { label: `Period ${period.period}`, detail: `${period.start}–${period.end}`, period };

  const { weekday, minutes } = getNewYorkClock(now);
  if (weekday === "Sat" || weekday === "Sun") return { label: "No classes today", detail: "Weekend", period: null };
  if (minutes < bellPeriods[0].startMinutes) return { label: "Before school", detail: `Period 1 begins at ${bellPeriods[0].start}`, period: null };
  if (minutes >= bellPeriods[bellPeriods.length - 1].endMinutes) return { label: "School day finished", detail: `The last period ended at ${bellPeriods[bellPeriods.length - 1].end}`, period: null };
  return { label: "Passing time", detail: "Your next period begins shortly", period: null };
}
