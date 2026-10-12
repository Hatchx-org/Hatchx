import assert from "node:assert/strict";
import test from "node:test";
import { parseClubShareLinkInput } from "./club-share-link.ts";

const now = Date.parse("2026-09-20T12:00:00.000Z");

test("accepts a valid Club fair link", () => {
  assert.deepEqual(parseClubShareLinkInput(" Fall Club Fair ", "2026-09-20T14:00:00.000Z", now), {
    label: "Fall Club Fair",
    expiresAt: "2026-09-20T14:00:00.000Z",
  });
});

test("rejects invalid labels and expiration windows", () => {
  assert.equal(parseClubShareLinkInput("x", "2026-09-20T14:00:00.000Z", now), null);
  assert.equal(parseClubShareLinkInput("Club Fair", "not-a-date", now), null);
  assert.equal(parseClubShareLinkInput("Club Fair", "2026-09-20T12:04:59.000Z", now), null);
  assert.equal(parseClubShareLinkInput("Club Fair", "2027-09-22T12:00:01.000Z", now), null);
});
