import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatHourLabelInTenantTz,
  tenantBucketStart,
  tenantCalendarDayKey,
  tenantDayStartFromIso,
  wallTimeInZoneToUtc,
} from "./display-timezone.js";

describe("display-timezone", () => {
  it("maps summer UTC instant to Madrid calendar day and hour (UTC+2)", () => {
    // 2026-05-22 10:30 UTC = 12:30 CEST
    const instant = new Date("2026-05-22T10:30:00.000Z");
    assert.equal(tenantCalendarDayKey(instant), "2026-05-22");
    assert.equal(formatHourLabelInTenantTz(instant.toISOString()), "12:30");
  });

  it("late-night Madrid trip stays on local calendar day", () => {
    // 2026-05-22 23:30 Madrid = 2026-05-22 21:30 UTC
    const instant = new Date("2026-05-22T21:30:00.000Z");
    assert.equal(tenantCalendarDayKey(instant), "2026-05-22");
    assert.equal(formatHourLabelInTenantTz(instant.toISOString()), "23:30");
  });

  it("tenantBucketStart aligns to Madrid hour boundary", () => {
    const instant = new Date("2026-05-22T10:30:00.000Z");
    const bucket = tenantBucketStart(instant, "hour");
    assert.equal(bucket.toISOString(), "2026-05-22T10:00:00.000Z"); // 12:00 Madrid
  });

  it("tenantDayStartFromIso returns Madrid midnight as UTC", () => {
    const start = tenantDayStartFromIso("2026-05-22");
    assert.equal(start.toISOString(), "2026-05-21T22:00:00.000Z"); // CEST +2
  });

  it("wallTimeInZoneToUtc handles winter offset (CET)", () => {
    const start = wallTimeInZoneToUtc(2026, 1, 15, 0, 0, 0);
    assert.equal(start.toISOString(), "2026-01-14T23:00:00.000Z");
  });
});
