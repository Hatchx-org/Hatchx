import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAuditSearch } from "./audit-query.ts";

test("audit date filters include the entire UTC day and reject reversed ranges", () => {
  const value = parseAuditSearch({ from: "2026-09-01", to: "2026-09-08" });
  assert.ok(!("error" in value));
  assert.equal(value.until, "2026-09-09T00:00:00.000Z");
  assert.ok("error" in parseAuditSearch({ from: "2026-09-09", to: "2026-09-08" }));
  assert.ok("error" in parseAuditSearch({ from: "2026-02-30" }));
});
test("audit actor filter accepts only complete IDs or emails", () => {
  assert.ok(!("error" in parseAuditSearch({ actor: "teacher@schools.nyc.gov" })));
  assert.ok(!("error" in parseAuditSearch({ actor: "10000000-0000-0000-0000-000000000001" })));
  assert.ok("error" in parseAuditSearch({ actor: "partial-name" }));
});
test("audit page and selectable filters stay within supported values", () => {
  for (const page of ["-1", "0", "Infinity", "1.5", "10001"]) {
    const result = parseAuditSearch({ page, resource: "unknown", operation: "DROP" });
    assert.ok(!("error" in result));
    assert.equal(result.page, 1);
    assert.equal(result.resource, "");
    assert.equal(result.operation, "");
  }
});
test("audit full-text search is normalized and bounded", () => {
  const result = parseAuditSearch({ kind: "changes", q: `  Club\uFF11 ${"x".repeat(140)}  ` });
  assert.ok(!("error" in result));
  assert.equal(result.q.startsWith("Club1 "), true);
  assert.equal(result.q.length, 120);
});
