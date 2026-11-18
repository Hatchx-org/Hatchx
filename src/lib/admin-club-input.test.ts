import assert from "node:assert/strict";
import test from "node:test";
import { parseAdminClubInput } from "./admin-club-input.ts";

function valid() {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    name: "Robotics Club",
    short_description: "Students build and compete with robots.",
    category: "STEM",
    status: "published",
    recruiting_status: "recruiting",
    join_policy: "approval_required",
    meeting_day: "3",
    start_time: "15:00",
    end_time: "16:00",
    location: "Room 101",
  })) form.set(key, value);
  return form;
}

test("parses a valid admin Club form", () => {
  const parsed = parseAdminClubInput(valid());
  assert.equal(parsed?.name, "Robotics Club");
  assert.deepEqual(parsed?.meeting, { dayOfWeek: 3, startTime: "15:00", endTime: "16:00", location: "Room 101" });
});

test("rejects invalid meeting ranges and unsafe statuses", () => {
  const dates = valid();
  dates.set("end_time", "14:00");
  assert.equal(parseAdminClubInput(dates), null);
  const status = valid();
  status.set("status", "deleted");
  assert.equal(parseAdminClubInput(status), null);
});

test("allows a Club without a meeting schedule", () => {
  const form = valid();
  form.delete("meeting_day");
  assert.equal(parseAdminClubInput(form)?.meeting, null);
});
