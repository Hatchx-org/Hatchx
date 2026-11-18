import assert from "node:assert/strict";
import test from "node:test";
import { profileCompletionPath, studentProfileNeedsCompletion } from "./profile-completion.ts";

test("student profiles require both a valid OSIS and grade", () => {
  assert.equal(studentProfileNeedsCompletion({ role: "student", osis_number: null, grade_level: null }), true);
  assert.equal(studentProfileNeedsCompletion({ role: "student", osis_number: "123456789", grade_level: null }), true);
  assert.equal(studentProfileNeedsCompletion({ role: "student", osis_number: "123456789", grade_level: 10 }), false);
});

test("staff profiles never require student onboarding", () => {
  assert.equal(studentProfileNeedsCompletion({ role: "teacher", osis_number: null, grade_level: null }), false);
  assert.equal(studentProfileNeedsCompletion({ role: "admin", osis_number: null, grade_level: null }), false);
});

test("profile completion keeps only safe local destinations", () => {
  assert.equal(profileCompletionPath("/clubs/check-in?code=ABCD2345"), "/profile/complete?next=%2Fclubs%2Fcheck-in%3Fcode%3DABCD2345");
  assert.equal(profileCompletionPath("https://example.com"), "/profile/complete?next=%2F");
});
