
import assert from "node:assert/strict";
import test from "node:test";
import {
  CLUB_ROSTER_REQUIRED_HEADERS,
  clubRosterMeeting,
  clubRosterMeetings,
  normalizeClubRosterHeaders,
  parseClubRosterRow,
} from "./club-roster-import.ts";

test("CSV accepts case-insensitive headers", () => {
  const headers = normalizeClubRosterHeaders([
    "CLUB",
    "Advisor",
    "Advisor Email",
    "DAY",
    "ROOM",
    "Period",
  ]);

  assert.deepEqual(headers, [
    "club",
    "advisor",
    "advisor_email",
    "day",
    "room",
    "period",
  ]);

  assert.deepEqual([...CLUB_ROSTER_REQUIRED_HEADERS], [
    "club",
  ]);

  const result = parseClubRosterRow(headers, [
    "Key Club",
    "Jane Smith",
    "JSmith@schools.nyc.gov",
    "Thursday",
    "301",
    "10",
  ]);

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.payload.slug, "key-club");
  assert.equal(
    result.payload.advisor_email,
    "jsmith@schools.nyc.gov"
  );

  assert.deepEqual(clubRosterMeeting(result.payload), {
    day_of_week: 4,
    start_time: "14:44:00",
    end_time: "15:31:00",
    location: "301",
  });
});

test("Invalid optional fields create warnings, not blocking errors", () => {
  const headers = normalizeClubRosterHeaders([
    "CLUB",
    "Advisor",
    "Advisor Email",
    "DAY",
    "ROOM",
    "Period",
  ]);

  const result = parseClubRosterRow(headers, [
    "Robotics Club",
    "",
    "not-an-email",
    "Funday",
    "",
    "12",
  ]);

  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.length, 3);
  assert.equal(clubRosterMeeting(result.payload), null);
});

test("Invalid Club name is still a blocking error", () => {
  const result = parseClubRosterRow(
    ["club"],
    ["A"]
  );

  assert.equal(result.errors.length, 1);
});

test("CSV allows only the Club column", () => {
  const result = parseClubRosterRow(
    ["club"],
    ["Mathematics Mentors Club"]
  );

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.equal(
    result.payload.slug,
    "mathematics-mentors-club"
  );
  assert.equal(result.payload.status, "published");
  assert.deepEqual(clubRosterMeetings(result.payload), []);
});

test("CSV supports multiple meeting days", () => {
  const headers = normalizeClubRosterHeaders([
    "CLUB",
    "DAY",
    "ROOM",
    "Period",
  ]);

  const result = parseClubRosterRow(headers, [
    "Coding Club",
    "Mon/Wed",
    "Room 120",
    "Period 11",
  ]);

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);

  const meetings = clubRosterMeetings(result.payload);

  assert.equal(meetings.length, 2);
  assert.deepEqual(
    meetings.map((meeting) => meeting.day_of_week),
    [1, 3]
  );

  assert.equal(meetings[0].start_time, "15:34:00");
  assert.equal(meetings[0].end_time, "16:21:00");
});

test("Custom periods do not block import", () => {
  const headers = normalizeClubRosterHeaders([
    "CLUB",
    "DAY",
    "Period",
  ]);

  const result = parseClubRosterRow(headers, [
    "Art Club",
    "Friday",
    "After school",
  ]);

  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.length, 1);

  const meetings = clubRosterMeetings(result.payload);

  assert.equal(meetings.length, 1);
  assert.equal(meetings[0].day_of_week, 5);
  assert.equal(meetings[0].start_time, null);
  assert.equal(
    meetings[0].recurrence_note,
    "Period: After school"
  );
});

test("Irregular schedules do not create false weekly meetings", () => {
  const result = parseClubRosterRow(
    ["club", "day"],
    ["Chess Club", "Every other Thursday"]
  );

  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.length, 1);
  assert.deepEqual(clubRosterMeetings(result.payload), []);
});
