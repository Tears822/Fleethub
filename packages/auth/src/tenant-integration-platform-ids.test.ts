import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canViewTenantPlatformIds,
  integrationSettingsForSession,
  type TenantIntegrationSettings,
} from "./tenant-general-settings.js";

const full: TenantIntegrationSettings = {
  pollingMinutesUber: 15,
  pollingMinutesFreeNow: 15,
  freenowPublicCompanyId: "GEYTMOBQGE",
  uberOrgId: "org-uuid",
  uberSyncDays: 7,
  freenowSyncDays: 7,
};

describe("tenant platform ids visibility", () => {
  it("only Super Admin impersonation can view platform tenant ids", () => {
    assert.equal(
      canViewTenantPlatformIds({
        kind: "tenant",
        tid: "t1",
        sub: "u1",
        email: "a@b.com",
        role: "ADMIN_TENANT",
        impersonating: true,
      }),
      true,
    );
    assert.equal(
      canViewTenantPlatformIds({
        kind: "tenant",
        tid: "t1",
        sub: "u1",
        email: "a@b.com",
        role: "ADMIN_TENANT",
      }),
      false,
    );
  });

  it("redacts ids for tenant admin", () => {
    const redacted = integrationSettingsForSession(
      {
        kind: "tenant",
        tid: "t1",
        sub: "u1",
        email: "a@b.com",
        role: "ADMIN_TENANT",
      },
      full,
    );
    assert.equal(redacted.freenowPublicCompanyId, "");
    assert.equal(redacted.uberOrgId, "");
    assert.equal(redacted.uberSyncDays, 7);
  });
});
