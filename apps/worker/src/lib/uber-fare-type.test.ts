import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mapUberFareTypeFromPaymentSplit,
  uberFareTypeMergeScore,
} from "./uber-fare-type.js";

describe("mapUberFareTypeFromPaymentSplit", () => {
  it("maps precio-only rows to T3", () => {
    assert.equal(
      mapUberFareTypeFromPaymentSplit({ precioCents: 1650n, meterCents: null }),
      "Precio cerrado (T3)",
    );
  });

  it("maps taxímetro-only rows to Taxímetro", () => {
    assert.equal(
      mapUberFareTypeFromPaymentSplit({ precioCents: null, meterCents: 2964n }),
      "Taxímetro",
    );
  });

  it("maps mixed rows to Taxímetro", () => {
    assert.equal(
      mapUberFareTypeFromPaymentSplit({ precioCents: 1000n, meterCents: 500n }),
      "Taxímetro",
    );
  });
});

describe("uberFareTypeMergeScore", () => {
  it("prefers T3/taxímetro over generic taxi", () => {
    assert.ok(uberFareTypeMergeScore("Precio cerrado (T3)") > uberFareTypeMergeScore("Taxi"));
    assert.ok(uberFareTypeMergeScore("Taxímetro") > uberFareTypeMergeScore("payments_order"));
  });
});
