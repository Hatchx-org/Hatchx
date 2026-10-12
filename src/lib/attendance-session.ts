export const temporaryAttendanceDurations = [1, 3, 5, 10, 15, 30, 60, 120, 240] as const;

export function isTemporaryAttendanceDuration(value: number) {
  return temporaryAttendanceDurations.includes(value as (typeof temporaryAttendanceDurations)[number]);
}

export function attendanceDurationLabel(minutes: number) {
  return minutes >= 60 ? `${minutes / 60} hour${minutes === 60 ? "" : "s"}` : `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export function isAttendanceStartAllowed(startsAt: number, now: number) {
  return Number.isFinite(startsAt) && startsAt >= now - 60_000 && startsAt <= now + 366 * 24 * 60 * 60 * 1000;
}

export function attendanceExpiresAt(startsAt: number, durationMinutes: number) {
  return new Date(startsAt + durationMinutes * 60_000).toISOString();
}
