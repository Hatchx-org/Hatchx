import assert from "node:assert/strict";
import test from "node:test";
import { buildClubInvitationEmail } from "./club-invitation-email.ts";

test("Club invitation email includes meetings and social links safely", () => {
  const result = buildClubInvitationEmail({
    clubName: "Science & Service",
    description: "Build things and help the community.",
    clubUrl: "https://hatchx.example/clubs/science-service",
    personalMessage: "Welcome <student>!",
    meetings: [{ id: "m", club_id: "c", day_of_week: 4, start_time: "14:44:00", end_time: "15:31:00", location: "301", recurrence_note: null, created_at: "" }],
    links: [{ id: "l", club_id: "c", platform: "instagram", label: "Instagram", value: "https://instagram.com/example", sort_order: 0, created_by: null, created_at: "" }],
  });
  assert.match(result.text, /Thursday · Period 10 · 301/);
  assert.match(result.text, /Instagram/);
  assert.doesNotMatch(result.html, /Welcome <student>/);
  assert.match(result.html, /Welcome &lt;student&gt;/);
});
