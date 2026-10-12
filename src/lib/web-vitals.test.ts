import assert from "node:assert/strict";
import test from "node:test";
import { p75, pageVitals } from "./web-vitals.ts";

test("p75 sorts values and uses nearest rank", () => {
  assert.equal(p75([3000, 1000, 2000, 4000]), 3000);
  assert.equal(p75([]), null);
});

test("groups real-device metrics by route and requires sufficient samples", () => {
  const rows = [1, 2, 3, 4, 5].map((n) => ({ event_name: "LCP", route: "/clubs", metric_value: n * 1000 }));
  assert.deepEqual(pageVitals(rows), [{ route: "/clubs", samples: 5, LCP: 4000, INP: null, CLS: null }]);
  assert.deepEqual(pageVitals(rows.slice(0, 4)), []);
});
