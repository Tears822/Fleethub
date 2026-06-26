import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractFreenowTripsFromBookingsByDriverName,
  normalizeFreenowDriverName,
  resolveFreenowTripsForDriverAccount,
} from "./freenow-driver-match.js";
import type { FreenowBooking } from "./freenow-sdk.js";

describe("freenow-driver-match", () => {
  it("normalizes names for accent-insensitive match", () => {
    assert.equal(normalizeFreenowDriverName("José María"), "jose maria");
  });

  it("resolves trips by driver name when external id is a spreadsheet short code", () => {
    const bookings = [
      {
        id: "booking-1",
        state: "ACCOMPLISHED",
        pickupDate: "2026-05-20T10:00:00.000Z",
        dropoffDate: "2026-05-20T10:15:00.000Z",
        driver: { id: "GYZPUBLICID01", name: "JORGE ALEJANDRO PEREZ SANGOQUIZA" },
        tourValue: { amount: 12.5, tip: 0, toll: 0, taxPercentage: 10 },
        paymentMethod: "APP",
      },
    ] as FreenowBooking[];

    const byDriver = new Map<string, never>();
    const resolved = resolveFreenowTripsForDriverAccount({
      externalDriverId: "1137JP",
      driverFullName: "JORGE ALEJANDRO PEREZ SANGOQUIZA",
      tripsByDriver: byDriver,
      bookings,
    });

    assert.equal(resolved.trips.length, 1);
    assert.equal(resolved.publicDriverId, "GYZPUBLICID01");
  });

  it("extractFreenowTripsFromBookingsByDriverName returns empty for unknown driver", () => {
    const result = extractFreenowTripsFromBookingsByDriverName([], "Unknown Driver");
    assert.equal(result.trips.length, 0);
    assert.equal(result.publicDriverId, null);
  });
});
