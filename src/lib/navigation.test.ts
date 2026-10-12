import assert from "node:assert/strict";
import test from "node:test";
import { POST_FORM_REDIRECT_STATUS, safeNextPath } from "./navigation.ts";

test("form POST redirects use See Other instead of replaying the POST", () => {
  assert.equal(POST_FORM_REDIRECT_STATUS, 303);
});

test("safeNextPath accepts local application paths", () => {
  assert.equal(safeNextPath("/clubs?category=STEM"), "/clubs?category=STEM");
  assert.equal(safeNextPath("/announcements#latest"), "/announcements#latest");
});

test("safeNextPath rejects external and malformed destinations", () => {
  assert.equal(safeNextPath("https://example.com"), "/");
  assert.equal(safeNextPath("//example.com"), "/");
  assert.equal(safeNextPath("/\\example.com"), "/");
  assert.equal(safeNextPath(null, "/login"), "/login");
});
