import assert from "node:assert/strict";
import test from "node:test";
import { authFailureLog, authFailureMessage, isAuthRateLimitError, parseRetryAfter } from "./auth-errors.ts";

test("recognizes Supabase rate-limit statuses and codes", () => {
  assert.equal(isAuthRateLimitError({ status: 429 }), true);
  assert.equal(isAuthRateLimitError({ code: "over_request_rate_limit" }), true);
  assert.equal(isAuthRateLimitError({ code: "over_email_send_rate_limit" }), true);
  assert.equal(isAuthRateLimitError({ status: 400, code: "invalid_credentials" }), false);
});

test("parses bounded Retry-After seconds and HTTP dates", () => {
  assert.equal(parseRetryAfter("45", 0), 45);
  assert.equal(parseRetryAfter("Thu, 01 Jan 1970 00:02:00 GMT", 60_000), 60);
  assert.equal(parseRetryAfter("99999", 0), 3600);
  assert.equal(parseRetryAfter("invalid", 0), null);
});

test("rate-limit messages preserve progress and logs exclude sensitive values", () => {
  assert.match(authFailureMessage({ code: "over_request_rate_limit" }, 90, "signup"), /2 minutes/);
  assert.match(authFailureMessage({ status: 429 }, null, "signin"), /information and destination have been kept/);
  const log = authFailureLog("signup", { status: 429, code: "over_request_rate_limit", message: "user@example.com" }, 60);
  assert.deepEqual(log, { event: "auth_failure", operation: "signup", status: 429, code: "over_request_rate_limit", retry_after_seconds: 60 });
  assert.equal(JSON.stringify(log).includes("example.com"), false);
});
