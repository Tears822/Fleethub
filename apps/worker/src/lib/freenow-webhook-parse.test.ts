import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseFreenowWebhookPayload } from "./freenow-webhook-parse.js";

const accomplishedBooking = {
  id: "fn-booking-99",
  state: "ACCOMPLISHED",
  pickupDate: "2026-05-22T08:15:00.000Z",
  dropoffDate: "2026-05-22T08:42:00.000Z",
  paymentMethod: "APP",
  tourValue: { amount: 18.5, tip: 1, toll: 0 },
  driver: { id: "driver-fn-1" },
};

describe("parseFreenowWebhookPayload", () => {
  it("parses booking nested under data", () => {
    const result = parseFreenowWebhookPayload({
      event_id: "evt-1",
      event_type: "booking.updated",
      data: accomplishedBooking,
    });
    assert.equal(result.ignored, false);
    assert.equal(result.trips.length, 1);
    assert.equal(result.trips[0]!.externalTripId, "fn-booking-99");
    assert.equal(result.externalDriverId, "driver-fn-1");
  });

  it("parses booking at root payload", () => {
    const result = parseFreenowWebhookPayload({
      type: "BOOKING_ACCOMPLISHED",
      booking: accomplishedBooking,
    });
    assert.equal(result.ignored, false);
    assert.equal(result.trips[0]!.paymentMethod, "app");
    assert.equal(result.trips[0]!.appPaymentCents, 1750n);
  });

  it("ignores non-accomplished booking", () => {
    const result = parseFreenowWebhookPayload({
      booking: { ...accomplishedBooking, state: "CANCELLED" },
    });
    assert.equal(result.ignored, true);
    assert.equal(result.trips.length, 0);
    assert.match(result.ignoreReason ?? "", /ACCOMPLISHED|state/i);
  });

  it("ignores empty or unknown payload", () => {
    assert.equal(parseFreenowWebhookPayload(null).ignored, true);
    assert.equal(parseFreenowWebhookPayload({ foo: "bar" }).ignored, true);
  });
});
