import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  orgMatchesFleetCompany,
  orderUberOrgIds,
  uberMultiOrgSyncEnabled,
  UBER_GROUP_EXCLUDED_ORG_NAME_PARTS,
} from "./uber-tenant-group-orgs.js";

describe("uber-tenant-group-orgs", () => {
  it("enables multi-org sync for cosculluela by default", () => {
    assert.equal(uberMultiOrgSyncEnabled("cosculluela"), true);
    assert.equal(uberMultiOrgSyncEnabled("trevino"), false);
  });

  it("matches Santacoloma org to fleet company name", () => {
    assert.equal(orgMatchesFleetCompany("Santacoloma Taxi SL", "SANTACOLOMA TAXI, S.L."), true);
    assert.equal(orgMatchesFleetCompany("Badavi S.L.", "BADAVI, S.L."), true);
    assert.equal(orgMatchesFleetCompany("Tradetaxis S.L.", "BADAVI, S.L."), false);
  });

  it("orders org ids with metadata preference first", () => {
    const orgs = [
      { orgId: "a", orgName: "Badavi" },
      { orgId: "b", orgName: "Santacoloma" },
    ];
    const ordered = orderUberOrgIds(orgs, "b");
    assert.equal(ordered[0]?.orgId, "b");
  });

  it("excludes tradetaxi and taxi business org names", () => {
    assert.ok(UBER_GROUP_EXCLUDED_ORG_NAME_PARTS.some((p) => "Tradetaxis S.L.".toLowerCase().includes(p)));
  });
});
