import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  freenowBookingToUpsert,
  freenowPaymentSplitCents,
} from "./freenow-booking-mapper.js";

describe("freenowBookingToUpsert", () => {
  it("maps APP to app with net in app column", () => {
    const trip = freenowBookingToUpsert({
      id: "b-1",
      state: "ACCOMPLISHED",
      pickupDate: "2026-05-24T18:25:00.000Z",
      dropoffDate: "2026-05-24T18:55:00.000Z",
      paymentMethod: "APP",
      tourValue: { amount: 29.45, tip: 0, toll: 0 },
    });
    assert.ok(trip);
    assert.equal(trip.paymentMethod, "app");
    assert.equal(trip.paymentValidated, true);
    assert.equal(trip.netAmountCents, 2945n);
    assert.equal(trip.appPaymentCents, 2945n);
    assert.equal(trip.cashPaymentCents, null);
    assert.equal(trip.cardPaymentCents, null);
  });

  it("maps CASH with net in cash column and unvalidated", () => {
    const trip = freenowBookingToUpsert({
      id: "b-2",
      state: "ACCOMPLISHED",
      pickupDate: "2026-05-24T20:00:00.000Z",
      dropoffDate: "2026-05-24T20:30:00.000Z",
      paymentMethod: "CASH",
      tourValue: { amount: 12, tip: 0, toll: 0 },
    });
    assert.ok(trip);
    assert.equal(trip.paymentMethod, "cash");
    assert.equal(trip.paymentValidated, false);
    assert.equal(trip.cashPaymentCents, 1200n);
    assert.equal(trip.appPaymentCents, null);
  });

  it("subtracts tip from net", () => {
    const trip = freenowBookingToUpsert({
      id: "b-3",
      state: "ACCOMPLISHED",
      pickupDate: "2026-05-21T00:07:00.000Z",
      dropoffDate: "2026-05-21T00:30:00.000Z",
      paymentMethod: "APP",
      tourValue: { amount: 13.8, tip: 2, toll: 0 },
    });
    assert.ok(trip);
    assert.equal(trip.netAmountCents, 1180n);
    assert.equal(trip.appPaymentCents, 1180n);
  });

  it("does not derive platform fee from taxPercentage (VAT, not commission)", () => {
    const trip = freenowBookingToUpsert({
      id: "b-5",
      state: "ACCOMPLISHED",
      pickupDate: "2026-05-23T00:27:00.000Z",
      dropoffDate: "2026-05-23T00:45:00.000Z",
      paymentMethod: "CASH",
      tourValue: { amount: 12.05, tip: 0, toll: 0, taxPercentage: 15 },
    });
    assert.ok(trip);
    assert.equal(trip.platformFeeCents, null);
    assert.equal(trip.netAmountCents, 1205n);
    assert.equal(trip.cashPaymentCents, 1205n);
  });

  it("ignores non-accomplished bookings", () => {
    assert.equal(
      freenowBookingToUpsert({
        id: "b-4",
        state: "CANCELED",
        pickupDate: "2026-05-24T18:25:00.000Z",
        paymentMethod: "APP",
      }),
      null,
    );
  });
});

describe("freenowPaymentSplitCents", () => {
  it("returns nulls for zero net", () => {
    const split = freenowPaymentSplitCents("app", 0n);
    assert.equal(split.appPaymentCents, null);
  });
});
