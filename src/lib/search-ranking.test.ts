import assert from "node:assert/strict";
import test from "node:test";
import { rankSearchResults } from "./search-ranking.ts";

const results = [
  { kind: "Club" as const, title: "Robotics Club", href: "/clubs/robotics", meta: "STEM" },
  { kind: "Event" as const, title: "Robotics Showcase", href: "/events/showcase", meta: "May 10" },
  { kind: "Club" as const, title: "Art Club", href: "/clubs/art", meta: "Robotics collaboration" },
  { kind: "Club" as const, title: "Robotics Club", href: "/clubs/robotics", meta: "duplicate" },
];

test("ranks title matches ahead of metadata matches and removes duplicates", () => {
  assert.deepEqual(
    rankSearchResults(results, "robotics").map((result) => result.href),
    ["/clubs/robotics", "/events/showcase", "/clubs/art"],
  );
});

test("requires all terms and bounds the result count", () => {
  assert.deepEqual(rankSearchResults(results, "robotics missing"), []);
  assert.equal(rankSearchResults(results, "club", 999).length, 2);
});

test("matches common synonyms without outranking an exact title", () => {
  const extended = [...results, { kind: "Opportunity" as const, title: "Hospital Internship", href: "/opportunities/hospital", meta: "Career" }];
  assert.equal(rankSearchResults(extended, "job")[0]?.href, "/opportunities/hospital");
  assert.equal(rankSearchResults(results, "organization")[0]?.href, "/clubs/robotics");
});

test("tolerates bounded spelling mistakes and diacritics", () => {
  assert.equal(rankSearchResults(results, "robotcs")[0]?.href, "/clubs/robotics");
  const accents = [{ kind: "Club" as const, title: "Café Culture", href: "/clubs/cafe", meta: "Language" }];
  assert.equal(rankSearchResults(accents, "cafe")[0]?.href, "/clubs/cafe");
  assert.deepEqual(rankSearchResults(results, "rt"), []);
});
