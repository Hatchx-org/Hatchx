import assert from "node:assert/strict";
import test from "node:test";
import { CLUB_ROSTER_REQUIRED_HEADERS, clubRosterMeeting, normalizeClubRosterHeaders, parseClubRosterRow } from "./club-roster-import.ts";

test("Club roster CSV accepts friendly case-insensitive headers", () => {
  const headers = normalizeClubRosterHeaders(["CLUB", "Advisor", "Advisor Email", "DAY", "ROOM", "Period"]);
  assert.deepEqual(headers, [...CLUB_ROSTER_REQUIRED_HEADERS]);
  const result = parseClubRosterRow(headers, ["Key Club", "Jane Smith", "JSmith@schools.nyc.gov", "Thursday", "301", "10"]);
  assert.deepEqual(result.errors, []);
  assert.equal(result.payload.slug, "key-club");
  assert.equal(result.payload.advisor_email, "jsmith@schools.nyc.gov");
  assert.deepEqual(clubRosterMeeting(result.payload), { day_of_week: 4, start_time: "14:44:00", end_time: "15:31:00", location: "301" });
});

test("Club roster CSV reports invalid advisor and meeting data", () => {
  const headers = [...CLUB_ROSTER_REQUIRED_HEADERS];
  const result = parseClubRosterRow(headers, ["A", "", "not-an-email", "Funday", "", "12"]);
  assert.equal(result.errors.length, 6);
});
