import assert from "node:assert/strict";
import test from "node:test";
import { isEventUpcoming, type EventItem } from "./data.ts";

const event = (dateISO: string, dateEndISO?: string): EventItem => ({
  id: "test",
  title: "Test event",
  category: "events",
  date: dateISO,
  dateISO,
  dateEndISO,
  time: "",
  location: "",
  price: "",
  description: "",
});

test("isEventUpcoming includes events ending today or later", () => {
  const today = new Date(2026, 7, 29);
  assert.equal(isEventUpcoming(event("2026-08-29"), today), true);
  assert.equal(isEventUpcoming(event("2026-08-30"), today), true);
  assert.equal(isEventUpcoming(event("2026-08-20", "2026-08-29"), today), true);
});

test("isEventUpcoming excludes expired events", () => {
  assert.equal(isEventUpcoming(event("2025-12-17"), new Date(2026, 7, 29)), false);
});
