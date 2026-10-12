import test from "node:test";
import assert from "node:assert/strict";
import { isClubMediaPermission, isMeaningfulAltText } from "./club-media.ts";

test("public media requires useful alternative text", () => {
  for (const value of ["Photo", "club image", "short", "   picture   "]) assert.equal(isMeaningfulAltText(value), false);
  assert.equal(isMeaningfulAltText("Students presenting their robotics project in the library"), true);
});

test("media permission values are closed to approved evidence types", () => {
  for (const value of ["no_people", "school_approved", "participant_consent", "guardian_consent"]) assert.equal(isClubMediaPermission(value), true);
  assert.equal(isClubMediaPermission("probably_ok"), false);
});
