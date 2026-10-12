import assert from "node:assert/strict";
import test from "node:test";
import { getCurrentBellPeriod, getSchoolDayStatus, getTimeOfDayGreeting } from "./bell-schedule.ts";

test("identifies the current period in New York time", () => {
  assert.equal(getCurrentBellPeriod(new Date("2026-09-17T12:15:00Z"))?.period, 2);
  assert.equal(getCurrentBellPeriod(new Date("2026-09-17T17:20:00Z"))?.period, 8);
});

test("uses New York time for dashboard greetings", () => {
  assert.equal(getTimeOfDayGreeting(new Date("2026-09-17T12:00:00Z")), "Good morning");
  assert.equal(getTimeOfDayGreeting(new Date("2026-09-17T18:00:00Z")), "Good afternoon");
  assert.equal(getTimeOfDayGreeting(new Date("2026-09-18T01:00:00Z")), "Good evening");
});

test("describes the current school-day state", () => {
  assert.equal(getSchoolDayStatus(new Date("2026-09-17T12:15:00Z")).label, "Period 2");
  assert.equal(getSchoolDayStatus(new Date("2026-09-17T12:48:00Z")).label, "Passing time");
  assert.equal(getSchoolDayStatus(new Date("2026-09-19T14:00:00Z")).label, "No classes today");
});

test("does not highlight passing time, after school, or weekends", () => {
  assert.equal(getCurrentBellPeriod(new Date("2026-09-17T12:48:00Z")), null);
  assert.equal(getCurrentBellPeriod(new Date("2026-09-17T21:00:00Z")), null);
  assert.equal(getCurrentBellPeriod(new Date("2026-09-19T14:00:00Z")), null);
});
