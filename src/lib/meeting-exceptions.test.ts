import assert from "node:assert/strict";
import test from "node:test";
import { isMeetingSuppressed } from "./meeting-exceptions.ts";

test("school closure suppresses every Club meeting across its date range", () => {
  const exceptions = [{ start_at: "2026-12-24T05:00:00.000Z", end_at: "2026-12-26T05:00:00.000Z", meeting_effect: "all" as const }];
  assert.equal(isMeetingSuppressed("2026-12-25", "club-a", exceptions), true);
  assert.equal(isMeetingSuppressed("2026-12-27", "club-a", exceptions), false);
});

test("Club cancellation only suppresses the selected Club", () => {
  const exceptions = [{ start_at: "2026-10-09T13:00:00.000Z", end_at: null, meeting_effect: "club" as const, affected_club_id: "club-a" }];
  assert.equal(isMeetingSuppressed("2026-10-09", "club-a", exceptions), true);
  assert.equal(isMeetingSuppressed("2026-10-09", "club-b", exceptions), false);
});

test("ordinary calendar events never suppress meetings", () => {
  const exceptions = [{ start_at: "2026-10-09T13:00:00.000Z", end_at: null, meeting_effect: "none" as const, affected_club_id: null }];
  assert.equal(isMeetingSuppressed("2026-10-09", "club-a", exceptions), false);
});
