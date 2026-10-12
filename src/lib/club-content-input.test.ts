import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMeetingInput, parseClubPostInput } from "./club-content-input.ts";

function form(values: Record<string, string>) {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
}
test("meeting input normalizes optional fields and validates weekdays", () => {
  assert.deepEqual(parseMeetingInput(form({ day_of_week: "2", period: "3", location: " Room 100 " })), { day_of_week: 2, start_time: "08:50:00", end_time: "09:39:00", location: "Room 100", recurrence_note: null });
  for (const day of ["", "0", "8", "1.5", "bad"]) assert.equal(parseMeetingInput(form({ day_of_week: day, period: "3" })), null);
});
test("meeting periods and content lengths are bounded", () => {
  for (const period of ["", "0", "12", "1.5", "bad"]) assert.equal(parseMeetingInput(form({ day_of_week: "1", period })), null);
  assert.equal(parseMeetingInput(form({ day_of_week: "1", period: "1", location: "a".repeat(241) })), null);
  assert.ok(parseMeetingInput(form({ day_of_week: "1", period: "11" })));
});
test("club post validation trims content and rejects empty or oversized updates", () => {
  assert.deepEqual(parseClubPostInput(form({ title: " News ", body: " Meeting today " })), { title: "News", body: "Meeting today" });
  assert.equal(parseClubPostInput(form({ title: "  ", body: "valid" })), null);
  assert.equal(parseClubPostInput(form({ title: "title", body: "a".repeat(4001) })), null);
});
