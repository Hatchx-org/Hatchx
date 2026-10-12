import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldClearAuthCookies } from "./session-errors.ts";

test("transient auth/network failures preserve the session cookies", () => {
  for (const error of [{ name: "AuthRetryableFetchError", status: 503 }, { status: 429 }, { code: "unexpected_failure", status: 500 }, {}]) {
    assert.equal(shouldClearAuthCookies(error), false);
  }
});
test("confirmed invalid sessions can clear their auth cookies", () => {
  assert.equal(shouldClearAuthCookies({ name: "AuthSessionMissingError" }), true);
  assert.equal(shouldClearAuthCookies({ code: "refresh_token_not_found" }), true);
  assert.equal(shouldClearAuthCookies({ code: "session_expired" }), true);
});
