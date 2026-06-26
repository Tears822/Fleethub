import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatEuroAmount,
  formatEuroFromCents,
  parseEuroAmount,
} from "./format-euro.ts";

test("formatEuroAmount always shows two decimals", () => {
  assert.equal(formatEuroAmount(14), "14,00 €");
  assert.equal(formatEuroAmount(14.2), "14,20 €");
  assert.equal(formatEuroAmount(12.78), "12,78 €");
});

test("formatEuroFromCents preserves cent precision", () => {
  assert.equal(formatEuroFromCents(1420), "14,20 €");
  assert.equal(formatEuroFromCents(1278), "12,78 €");
  assert.equal(formatEuroFromCents(142), "1,42 €");
});

test("parseEuroAmount reads formatted and legacy strings", () => {
  assert.equal(parseEuroAmount("14,20 €"), 14.2);
  assert.equal(parseEuroAmount("14,20\u00a0€"), 14.2);
  assert.equal(parseEuroAmount("-1,42 €"), -1.42);
});
