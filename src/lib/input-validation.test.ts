import assert from "node:assert/strict";
import test from "node:test";
import {
  isValidOptionalTime,
  parseOptionalDateOnly,
  parseOptionalIsoDateTime,
} from "./input-validation.ts";

test("parseOptionalIsoDateTime rejects invalid values without throwing", () => {
  assert.equal(parseOptionalIsoDateTime(""), null);
  assert.equal(parseOptionalIsoDateTime("not-a-date"), undefined);
  assert.equal(parseOptionalIsoDateTime("2026-09-01T15:30:00Z"), "2026-09-01T15:30:00.000Z");
});

test("parseOptionalDateOnly validates real calendar dates", () => {
  assert.equal(parseOptionalDateOnly(""), null);
  assert.equal(parseOptionalDateOnly("2026-02-29"), undefined);
  assert.equal(parseOptionalDateOnly("2028-02-29"), "2028-02-29");
});

test("isValidOptionalTime accepts only valid 24-hour times", () => {
  assert.equal(isValidOptionalTime(""), true);
  assert.equal(isValidOptionalTime("15:30"), true);
  assert.equal(isValidOptionalTime("25:00"), false);
});
