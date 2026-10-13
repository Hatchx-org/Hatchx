import assert from "node:assert/strict";
import test from "node:test";
import { newYorkDayBounds } from "./calendar-date.ts";

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
