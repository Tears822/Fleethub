import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findUberOrgForTenant,
  uberOrgEnvVarForTenantSlug,
  uberOrgMatchesTenant,
} from "./uber-tenant-org-map.js";

describe("uber-tenant-org-map", () => {
  it("maps trade-taxi-sl to Tradetaxis org name", () => {
    const orgs = [
      { id: "badavi-id", name: "Badavi S.L." },
      { id: "trade-id", name: "Tradetaxis S.L." },
    ];
    const found = findUberOrgForTenant(orgs, "trade-taxi-sl");
    assert.equal(found?.orgId, "trade-id");
    assert.equal(found?.orgName, "Tradetaxis S.L.");
  });

  it("does not match BADAVI org for trade-taxi-sl", () => {
    assert.equal(uberOrgMatchesTenant("Badavi S.L.", "trade-taxi-sl"), false);
    assert.equal(uberOrgMatchesTenant("Tradetaxis S.L.", "trade-taxi-sl"), true);
  });

  it("uses env var naming convention", () => {
    assert.equal(uberOrgEnvVarForTenantSlug("trade-taxi-sl"), "UBER_ORG_ID_TRADE_TAXI_SL");
  });
});
