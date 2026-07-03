import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  uberAutoImportEnabledForTenantSlug,
  uberAutoImportAllTenantsEnabled,
} from "./uber-auto-import-tenants.js";

describe("uberAutoImportEnabledForTenantSlug", () => {
  const prevAll = process.env.UBER_SYNC_IMPORT_ALL_DRIVERS;
  const prevTenants = process.env.UBER_SYNC_AUTO_IMPORT_TENANTS;

  beforeEach(() => {
    delete process.env.UBER_SYNC_IMPORT_ALL_DRIVERS;
    delete process.env.UBER_SYNC_AUTO_IMPORT_TENANTS;
  });

  afterEach(() => {
    if (prevAll === undefined) delete process.env.UBER_SYNC_IMPORT_ALL_DRIVERS;
    else process.env.UBER_SYNC_IMPORT_ALL_DRIVERS = prevAll;
    if (prevTenants === undefined) delete process.env.UBER_SYNC_AUTO_IMPORT_TENANTS;
    else process.env.UBER_SYNC_AUTO_IMPORT_TENANTS = prevTenants;
  });

  it("enables trevino and trade-taxi-sl by default", () => {
    assert.equal(uberAutoImportEnabledForTenantSlug("trevino"), true);
    assert.equal(uberAutoImportEnabledForTenantSlug("trade-taxi-sl"), true);
    assert.equal(uberAutoImportEnabledForTenantSlug("cosculluela"), false);
  });

  it("respects UBER_SYNC_AUTO_IMPORT_TENANTS override", () => {
    process.env.UBER_SYNC_AUTO_IMPORT_TENANTS = "demo-a,cosculluela";
    assert.equal(uberAutoImportEnabledForTenantSlug("demo-a"), true);
    assert.equal(uberAutoImportEnabledForTenantSlug("trevino"), false);
  });

  it("global flag imports all tenants", () => {
    process.env.UBER_SYNC_IMPORT_ALL_DRIVERS = "1";
    assert.equal(uberAutoImportAllTenantsEnabled(), true);
    assert.equal(uberAutoImportEnabledForTenantSlug("cosculluela"), true);
  });
});
