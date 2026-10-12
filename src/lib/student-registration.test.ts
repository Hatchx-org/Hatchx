import assert from "node:assert/strict";
import test from "node:test";
import { isStudentEmail, normalizeGrade, normalizeInviteCodes, normalizeOsis } from "./student-registration.ts";

test("student registration recognizes student email addresses", () => {
  assert.equal(isStudentEmail("Student@nycstudents.net"), true);
  assert.equal(isStudentEmail("teacher@schools.nyc.gov"), false);
});

test("OSIS and grade values use school-safe bounds", () => {
  assert.equal(normalizeOsis("123 456 789"), "123456789");
  assert.equal(normalizeOsis("12345"), null);
  assert.equal(normalizeGrade("9"), 9);
  assert.equal(normalizeGrade("12"), 12);
  assert.equal(normalizeGrade("13"), null);
});

test("invite codes are normalized, deduplicated and bounded", () => {
  assert.deepEqual(normalizeInviteCodes([" abc-123 ", "ABC-123", "club!two", ""]), ["ABC-123", "CLUBTWO"]);
  assert.equal(normalizeInviteCodes(Array.from({ length: 12 }, (_, index) => `code-${index}`)).length, 8);
});
