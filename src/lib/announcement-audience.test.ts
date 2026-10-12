import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAnnouncementAudience } from "./announcement-audience.ts";

test("school audience discards stale grade and Club selections", () => {
  assert.deepEqual(normalizeAnnouncementAudience({ audienceType: "school", audienceGrades: [9], audienceClubIds: ["0d8fbc9a-775d-4e12-b9a2-42c0f74d2d11"] }), {
    audience_type: "school", audience_grades: [], audience_club_ids: [],
  });
});

test("targeted audiences require valid selections and remove duplicates", () => {
  assert.equal(normalizeAnnouncementAudience({ audienceType: "grades", audienceGrades: [8, 13], audienceClubIds: [] }), null);
  assert.deepEqual(normalizeAnnouncementAudience({ audienceType: "grades", audienceGrades: [10, 10, 12], audienceClubIds: [] })?.audience_grades, [10, 12]);
  assert.equal(normalizeAnnouncementAudience({ audienceType: "clubs", audienceGrades: [], audienceClubIds: ["not-an-id"] }), null);
});
