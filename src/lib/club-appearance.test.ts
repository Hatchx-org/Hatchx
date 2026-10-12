import assert from "node:assert/strict";
import test from "node:test";
import { foregroundForGradient, isHexColor } from "./club-appearance.ts";

test("Club appearance accepts only complete six-digit colors", () => {
  assert.equal(isHexColor("#97b4de"), true);
  for (const value of ["red", "#fff", "#12345g", "#12345678"]) assert.equal(isHexColor(value), false);
});

test("Club hero text automatically contrasts its gradient", () => {
  assert.equal(foregroundForGradient("#f0ebe5", "#97b4de"), "#2a2829");
  assert.equal(foregroundForGradient("#10172f", "#263a99"), "#ffffff");
});
