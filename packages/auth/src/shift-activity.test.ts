import assert from "node:assert/strict";
import { test } from "node:test";
import { computeDayMetricsFromTripSlices } from "./day-metrics.js";
import {
  formatAppsEurHora,
  formatShiftEurHora,
  mergeShiftConnectedMinutes,
  parseShiftHorasConectadoMinutes,
  resolveEurPerHourFromConnectedMinutes,
  resolveShiftEurHoraDisplay,
} from "./shift-activity.js";

test("resolveEurPerHourFromConnectedMinutes caps at gross when under 60 minutes", () => {
  assert.equal(resolveEurPerHourFromConnectedMinutes(3500, 24), 35);
  assert.equal(formatAppsEurHora(3500, 24), "35,00 €");
  assert.equal(formatAppsEurHora(2005, 29), "20,05 €");
});

test("resolveEurPerHourFromConnectedMinutes divides by hours from 60 minutes", () => {
  assert.equal(resolveEurPerHourFromConnectedMinutes(3500, 120), 17.5);
});

test("formatShiftEurHora shows total gross when shift is under 60 minutes", () => {
  // 14,20 € in 20 min → 14,20 € (not extrapolated to 42,60 €/h)
  assert.equal(formatShiftEurHora(1420, 20), "14,20 €");
});

test("formatShiftEurHora divides by hours when shift is 60 minutes or more", () => {
  // 14,20 € in 3 h → 4,73 €/h
  assert.equal(formatShiftEurHora(1420, 180), "4,73 €");
});

test("parseShiftHorasConectadoMinutes parses shift duration labels", () => {
  assert.equal(parseShiftHorasConectadoMinutes("0h 20min"), 20);
  assert.equal(parseShiftHorasConectadoMinutes("3h 0min"), 180);
});

test("resolveShiftEurHoraDisplay matches formatShiftEurHora for short and long shifts", () => {
  assert.equal(resolveShiftEurHoraDisplay(1420, "0h 20min"), "14,20 €");
  assert.equal(resolveShiftEurHoraDisplay(1420, "3h 0min"), "4,73 €");
});

test("mergeShiftConnectedMinutes matches Apps max rule for full-day batches", () => {
  assert.equal(mergeShiftConnectedMinutes(421, 451, true), 451);
  assert.equal(mergeShiftConnectedMinutes(152, 451, false), 152);
  assert.equal(mergeShiftConnectedMinutes(0, 451, true), 451);
});

test("shift hours estimate uses span from first trip start to last trip end", () => {
  const trips = [
    {
      startedAt: new Date("2026-05-20T18:17:00.000Z"),
      endedAt: new Date("2026-05-20T18:32:00.000Z"),
    },
    {
      startedAt: new Date("2026-05-20T22:29:00.000Z"),
      endedAt: new Date("2026-05-20T22:45:00.000Z"),
    },
    {
      startedAt: new Date("2026-05-21T02:07:00.000Z"),
      endedAt: new Date("2026-05-21T02:25:00.000Z"),
    },
    {
      startedAt: new Date("2026-05-21T04:08:00.000Z"),
      endedAt: new Date("2026-05-21T04:20:00.000Z"),
    },
  ];

  const { hoursOnline } = computeDayMetricsFromTripSlices(trips);
  // ~9h 57min from first start to last end, not sum of trip durations (~1h)
  assert.ok(hoursOnline >= 9.5, `expected span >= 9.5h, got ${hoursOnline}`);
});
