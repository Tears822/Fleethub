import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyPaymentMethod, isCollectiblePaymentTrip } from "./trip-payment-buckets.js";

describe("trip-payment-buckets", () => {
  it("classifies payment methods", () => {
    assert.equal(classifyPaymentMethod("cash"), "cash");
    assert.equal(classifyPaymentMethod("EFECTIVO"), "cash");
    assert.equal(classifyPaymentMethod("card"), "card");
    assert.equal(classifyPaymentMethod("app"), "app");
  });

  it("collectible only when validated", () => {
    assert.equal(isCollectiblePaymentTrip(true), true);
    assert.equal(isCollectiblePaymentTrip(undefined), true);
    assert.equal(isCollectiblePaymentTrip(false), false);
  });
});
