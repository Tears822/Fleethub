import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canReopenClosedShift } from "./rbac.js";
import { TenantRole } from "@fleethub/db";

describe("canReopenClosedShift", () => {
  it("allows tenant admin only", () => {
    assert.equal(canReopenClosedShift(TenantRole.ADMIN_TENANT), true);
    assert.equal(canReopenClosedShift(TenantRole.GESTOR), false);
    assert.equal(canReopenClosedShift(TenantRole.SOLO_LECTURA), false);
  });
});
