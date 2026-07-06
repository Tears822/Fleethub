import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RidePlatform } from "@fleethub/db";
import { resolvePlatformSyncDays } from "./platform-sync-window.js";

describe("resolvePlatformSyncDays", () => {
  it("uses 2-day poll window by default", () => {
    assert.equal(
      resolvePlatformSyncDays({
        platform: RidePlatform.UBER,
        trigger: "poll",
        tenantDays: 7,
      }),
      2,
    );
  });

  it("uses full tenant window on manual sync", () => {
    assert.equal(
      resolvePlatformSyncDays({
        platform: RidePlatform.UBER,
        trigger: "manual",
        tenantDays: 7,
      }),
      7,
    );
  });

  it("uses liquidation window", () => {
    assert.equal(
      resolvePlatformSyncDays({
        platform: RidePlatform.FREENOW,
        trigger: "liquidation",
        tenantDays: 7,
      }),
      2,
    );
  });

  it("respects explicit override", () => {
    assert.equal(
      resolvePlatformSyncDays({
        platform: RidePlatform.UBER,
        trigger: "poll",
        tenantDays: 7,
        syncDaysOverride: 5,
      }),
      5,
    );
  });
});
