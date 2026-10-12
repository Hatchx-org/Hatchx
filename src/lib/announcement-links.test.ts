import assert from "node:assert/strict";
import test from "node:test";
import { announcementParts } from "./announcement-links.ts";

test("makes HTTPS URLs clickable without swallowing punctuation", () => {
  assert.deepEqual(announcementParts("Register at https://example.org/apply?club=robotics. Thanks!"), [
    { text: "Register at " },
    { text: "https://example.org/apply?club=robotics", href: "https://example.org/apply?club=robotics" },
    { text: "." },
    { text: " Thanks!" },
  ]);
});

test("keeps unsafe or malformed text unlinked", () => {
  assert.deepEqual(announcementParts("javascript:alert(1) http://example.org"), [{ text: "javascript:alert(1) http://example.org" }]);
  assert.deepEqual(announcementParts("https://"), [{ text: "https://" }]);
});
