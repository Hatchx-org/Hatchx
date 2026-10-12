import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedEmail } from "./email-access.ts";

test("isAllowedEmail accepts configured school domains", () => {
  assert.equal(isAllowedEmail("Student@nycstudents.net", ["nycstudents.net"]), true);
  assert.equal(isAllowedEmail("advisor@schools.nyc.gov", ["schools.nyc.gov"]), true);
});

test("isAllowedEmail rejects suffix tricks and missing addresses", () => {
  assert.equal(isAllowedEmail("person@nycstudents.net.example.com", ["nycstudents.net"]), false);
  assert.equal(isAllowedEmail("person@example.com", ["nycstudents.net"]), false);
  assert.equal(isAllowedEmail(null, ["nycstudents.net"]), false);
});

test("default school domains include students and both advisor domain spellings", () => {
  assert.equal(isAllowedEmail("student@nycstudents.net"), true);
  assert.equal(isAllowedEmail("advisor@school.doe.gov"), true);
  assert.equal(isAllowedEmail("advisor@schools.nyc.gov"), true);
});
