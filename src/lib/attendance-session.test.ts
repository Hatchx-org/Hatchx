import assert from "node:assert/strict";
import test from "node:test";
import { attendanceDurationLabel, attendanceExpiresAt, isAttendanceStartAllowed, isTemporaryAttendanceDuration } from "./attendance-session.ts";

test("quick attendance accepts short controlled windows", () => {
  for (const minutes of [1, 3, 5, 10, 15, 30, 60, 120, 240]) assert.equal(isTemporaryAttendanceDuration(minutes), true);
  for (const minutes of [0, 2, 241, Number.NaN]) assert.equal(isTemporaryAttendanceDuration(minutes), false);
});

test("attendance duration labels remain readable", () => {
  assert.equal(attendanceDurationLabel(1), "1 minute");
  assert.equal(attendanceDurationLabel(60), "1 hour");
  assert.equal(attendanceDurationLabel(120), "2 hours");
});

test("scheduled attendance validates its advance window and expires from its start", () => {
  const now = Date.parse("2026-10-04T12:00:00.000Z");
  const start = Date.parse("2026-10-05T12:00:00.000Z");
  assert.equal(isAttendanceStartAllowed(start, now), true);
  assert.equal(isAttendanceStartAllowed(now - 61_000, now), false);
  assert.equal(isAttendanceStartAllowed(now + 367 * 24 * 60 * 60 * 1000, now), false);
  assert.equal(attendanceExpiresAt(start, 15), "2026-10-05T12:15:00.000Z");
});
