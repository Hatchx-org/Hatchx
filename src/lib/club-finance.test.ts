import { test } from "node:test";
import assert from "node:assert/strict";
import { daysBetween, parseMoneyToCents, parseNonNegativeMoneyToCents, schoolYearIsValid } from "./club-finance.ts";

test("money input converts exact decimal amounts to integer cents", () => {
  assert.equal(parseMoneyToCents("12.34"), 1234);
  assert.equal(parseMoneyToCents("10"), 1000);
  for (const value of ["0", "-2", "1.234", "abc", "10000000"]) assert.equal(parseMoneyToCents(value), null);
  assert.equal(parseNonNegativeMoneyToCents("0"), 0);
});

test("finance dates and school years use bounded calendar rules", () => {
  assert.equal(schoolYearIsValid("2026-2027"), true);
  assert.equal(schoolYearIsValid("2026-2028"), false);
  assert.equal(daysBetween("2026-09-01", "2026-10-01"), 30);
});
