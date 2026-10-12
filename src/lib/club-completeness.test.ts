import assert from "node:assert/strict";
import test from "node:test";
import { clubCompleteness } from "./club-completeness.ts";

test("clubCompleteness scores complete and incomplete profiles", () => {
  assert.equal(clubCompleteness({
    short_description: "A complete and useful club description.",
    interest_tags: ["STEM"],
    contact_email: "club@example.edu",
    google_classroom_code: "abc123",
    active_start_date: "2026-09-01",
    active_end_date: "2027-06-30",
  }), 100);
  assert.equal(clubCompleteness({
    short_description: "Short",
    interest_tags: [],
    contact_email: null,
    google_classroom_code: null,
    active_start_date: null,
    active_end_date: null,
  }), 0);
});
