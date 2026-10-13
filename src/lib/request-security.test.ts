import assert from "node:assert/strict";
import test from "node:test";
import { isJsonRequest, isSameOriginRequest } from "./request-security.ts";

function request(headers: Record<string, string>) {
  return new Request("https://hatchx.example/api/write", { method: "POST", headers });
}

test("accepts exact-origin browser writes", () => {
  assert.equal(isSameOriginRequest(request({ origin: "https://hatchx.example", "sec-fetch-site": "same-origin" })), true);
});

test("rejects cross-site, sibling-subdomain, malformed, and headerless writes", () => {
  assert.equal(isSameOriginRequest(request({ origin: "https://evil.example", "sec-fetch-site": "cross-site" })), false);
  assert.equal(isSameOriginRequest(request({ origin: "https://other.hatchx.example", "sec-fetch-site": "same-site" })), false);
  assert.equal(isSameOriginRequest(request({ origin: "not a url" })), false);
  assert.equal(isSameOriginRequest(request({})), false);
});

test("requires the JSON media type while allowing a charset", () => {
  assert.equal(isJsonRequest(request({ "content-type": "application/json; charset=utf-8" })), true);
  assert.equal(isJsonRequest(request({ "content-type": "text/plain" })), false);
});
