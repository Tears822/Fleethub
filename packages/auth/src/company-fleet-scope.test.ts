import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isFleetOperatorTaxId } from "./company-fleet-scope.js";

describe("isFleetOperatorTaxId", () => {
  it("accepts corporate CIF (S.L.)", () => {
    assert.equal(isFleetOperatorTaxId("B60508603"), true);
    assert.equal(isFleetOperatorTaxId("B60867942"), true);
  });

  it("rejects personal NIF used for autónomo driver companies", () => {
    assert.equal(isFleetOperatorTaxId("46528490L"), false);
    assert.equal(isFleetOperatorTaxId("38147589L"), false);
    assert.equal(isFleetOperatorTaxId("40998662N"), false);
  });

  it("accepts production seed tax ids", () => {
    assert.equal(isFleetOperatorTaxId("P-NOEMI-ALQ"), true);
  });
});
