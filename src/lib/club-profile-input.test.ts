import assert from "node:assert/strict";
import test from "node:test";
import { parseClubProfileInput, parseClubTags } from "./club-profile-input.ts";

function profile(tags = ["STEM", "Robotics", "Competition"]) {
  const form = new FormData();
  form.set("short_description", "A concise description of this Club.");
  form.set("full_description", "A complete description with enough detail for students to understand the Club.");
  form.set("weekly_commitment_hours", "2.5");
  tags.forEach((tag) => form.append("interest_tags", tag));
  return form;
}

test("club profiles accept three normalized, unique tags", () => {
  const parsed = parseClubProfileInput(profile([" STEM ", "Student   Leadership", "Robotics"]));
  assert.deepEqual(parsed?.tags, ["STEM", "Student Leadership", "Robotics"]);
  assert.equal(parsed?.weeklyCommitmentHours, 2.5);
});

test("club profiles reject too many or duplicate tags", () => {
  assert.equal(parseClubProfileInput(profile(["One", "Two", "Three", "Four"])), null);
  assert.equal(parseClubProfileInput(profile(["STEM", "stem"])), null);
});

test("standalone tag management uses the same three-tag rules", () => {
  assert.deepEqual(parseClubTags(["Arts", "Photography", "Community"]), ["Arts", "Photography", "Community"]);
  assert.equal(parseClubTags(["Arts", "arts"]), null);
  assert.equal(parseClubTags(["One", "Two", "Three", "Four"]), null);
});
