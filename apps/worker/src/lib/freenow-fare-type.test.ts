import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mapFreenowFareType,
  mapFreenowFixedFare,
  mapFreenowSubFleetTypeLabel,
  mapFreenowSubFleetTypeId,
} from "./freenow-fare-type.js";

describe("mapFreenowSubFleetTypeId", () => {
  it("maps LITE ids to T3", () => {
    assert.equal(mapFreenowSubFleetTypeId("TAXILITEB2B-ES-1662"), "Precio cerrado (T3)");
    assert.equal(mapFreenowSubFleetTypeId("TAXILITEB2BXL-ES-1662"), "Precio cerrado (T3)");
  });

  it("maps street taxi ids to Taxímetro", () => {
    assert.equal(mapFreenowSubFleetTypeId("TAXI-ES-1330"), "Taxímetro");
    assert.equal(mapFreenowSubFleetTypeId("B2BTAXI-ES-1662"), "Taxímetro");
  });
});

describe("mapFreenowSubFleetTypeLabel", () => {
  it("maps Taxi Fixed Price to T3", () => {
    assert.equal(mapFreenowSubFleetTypeLabel("Taxi Fixed Price"), "Precio cerrado (T3)");
    assert.equal(mapFreenowSubFleetTypeLabel("Taxi Green Fixed Price"), "Precio cerrado (T3)");
  });

  it("maps Taxi Metered to Taxímetro", () => {
    assert.equal(mapFreenowSubFleetTypeLabel("Taxi Metered"), "Taxímetro");
  });
});

describe("mapFreenowFixedFare", () => {
  it("maps true to T3 and false to Taxímetro", () => {
    assert.equal(mapFreenowFixedFare(true), "Precio cerrado (T3)");
    assert.equal(mapFreenowFixedFare(false), "Taxímetro");
    assert.equal(mapFreenowFixedFare(null), null);
  });
});

describe("mapFreenowFareType", () => {
  it("prefers fixedFare over subFleetTypeId heuristics", () => {
    assert.equal(
      mapFreenowFareType("TAXI", null, "TAXI-ES-1330", true),
      "Precio cerrado (T3)",
    );
    assert.equal(
      mapFreenowFareType("TAXI", "Taxi Fixed Price", "TAXILITEB2B-ES-1662", false),
      "Taxímetro",
    );
  });

  it("prefers subFleetTypeId when label is missing", () => {
    assert.equal(
      mapFreenowFareType("TAXI", null, "TAXILITEB2B-ES-1662"),
      "Precio cerrado (T3)",
    );
    assert.equal(mapFreenowFareType("TAXI", null, "TAXI-ES-1330"), "Taxímetro");
  });

  it("prefers subFleetTypeLabel over generic hailingType TAXI", () => {
    assert.equal(mapFreenowFareType("TAXI", "Taxi Fixed Price"), "Precio cerrado (T3)");
    assert.equal(mapFreenowFareType("TAXI", "Taxi Metered"), "Taxímetro");
  });

  it("maps non-metered to T3", () => {
    assert.equal(mapFreenowFareType("NON_METERED"), "Precio cerrado (T3)");
  });

  it("maps metered hailing to taxímetro", () => {
    assert.equal(mapFreenowFareType("METERED"), "Taxímetro");
  });

  it("passes through unknown labels", () => {
    assert.equal(mapFreenowFareType("STREET_HAIL"), "STREET_HAIL");
  });
});
