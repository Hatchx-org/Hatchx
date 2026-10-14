import assert from "node:assert/strict";
import test from "node:test";
import { newYorkDateKey, newYorkDateTimeInput, newYorkDateTimeToUtc, newYorkDayBounds } from "./calendar-date.ts";

test("New York calendar deletion uses complete standard-time dates", () => {
  assert.deepEqual(newYorkDayBounds("2026-01-15"), {
    start: "2026-01-15T05:00:00.000Z",
    end: "2026-01-16T05:00:00.000Z",
  });
});

test("New York calendar deletion follows daylight-saving boundaries", () => {
  assert.deepEqual(newYorkDayBounds("2026-03-08"), {
    start: "2026-03-08T05:00:00.000Z",
    end: "2026-03-09T04:00:00.000Z",
  });
  assert.equal(newYorkDayBounds("2026-02-30"), null);
});

test("New York event dates do not shift to the following UTC date", () => {
  assert.equal(newYorkDateTimeToUtc("2026-10-14T21:30"), "2026-10-15T01:30:00.000Z");
  assert.equal(newYorkDateKey("2026-10-15T01:30:00.000Z"), "2026-10-14");
  assert.equal(newYorkDateTimeInput("2026-10-15T01:30:00.000Z"), "2026-10-14T21:30");
});

test("New York datetime parser rejects impossible wall-clock dates", () => {
  assert.equal(newYorkDateTimeToUtc("2026-02-30T12:00"), undefined);
  assert.equal(newYorkDateTimeToUtc("2026-03-08T02:30"), undefined);
});
