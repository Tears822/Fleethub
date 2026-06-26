import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeCompanyMatchKey } from "./freenow-company-map.js";

describe("normalizeCompanyMatchKey", () => {
  it("strips punctuation and case", () => {
    assert.equal(normalizeCompanyMatchKey("BADAVI, S.L."), "BADAVISL");
    assert.equal(normalizeCompanyMatchKey("BADAVI SL"), "BADAVISL");
    assert.equal(normalizeCompanyMatchKey("TAXIS GALERA, S.L."), "TAXISGALERASL");
    assert.equal(normalizeCompanyMatchKey("TAXIS GALERA SL"), "TAXISGALERASL");
  });
});
