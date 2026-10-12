import assert from "node:assert/strict";
import test from "node:test";
import { developmentFallback, normalizeRecordId } from "./live-data.ts";

test("demo records are available outside production only", () => {
  assert.deepEqual(developmentFallback(["demo"], "development"), ["demo"]);
  assert.deepEqual(developmentFallback(["demo"], "test"), ["demo"]);
  assert.deepEqual(developmentFallback(["demo"], "production"), []);
});

test("normalizeRecordId supports legacy numeric and canonical string IDs", () => {
  assert.equal(normalizeRecordId(42), "42");
  assert.equal(normalizeRecordId("76c3a57b"), "76c3a57b");
});
