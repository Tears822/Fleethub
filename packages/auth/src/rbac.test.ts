import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TenantRole } from "@fleethub/db";
import {
  canExportTenantData,
  canManageDrivers,
  canManageShifts,
  canManageTenantSettings,
  isReadOnly,
  isTenantRouteAllowed,
  isTenantUsersAdminApiPath,
  isTenantCompaniesAdminApiPath,
  isTenantShiftLiquidationExportPostPath,
} from "./rbac.js";

describe("tenant RBAC matrix", () => {
  const roles = [
    TenantRole.ADMIN_TENANT,
    TenantRole.GESTOR,
    TenantRole.SOLO_LECTURA,
  ] as const;

  it("admin can manage settings, drivers, shifts, and export", () => {
    assert.equal(canManageTenantSettings(TenantRole.ADMIN_TENANT), true);
    assert.equal(canManageDrivers(TenantRole.ADMIN_TENANT), true);
    assert.equal(canManageShifts(TenantRole.ADMIN_TENANT), true);
    assert.equal(canExportTenantData(TenantRole.ADMIN_TENANT), true);
    assert.equal(isReadOnly(TenantRole.ADMIN_TENANT), false);
  });

  it("gestor can manage drivers and shifts but not settings", () => {
    assert.equal(canManageTenantSettings(TenantRole.GESTOR), false);
    assert.equal(canManageDrivers(TenantRole.GESTOR), true);
    assert.equal(canManageShifts(TenantRole.GESTOR), true);
    assert.equal(canExportTenantData(TenantRole.GESTOR), true);
  });

  it("solo lectura is read-only with export only", () => {
    assert.equal(canManageTenantSettings(TenantRole.SOLO_LECTURA), false);
    assert.equal(canManageDrivers(TenantRole.SOLO_LECTURA), false);
    assert.equal(canManageShifts(TenantRole.SOLO_LECTURA), false);
    assert.equal(canExportTenantData(TenantRole.SOLO_LECTURA), true);
    assert.equal(isReadOnly(TenantRole.SOLO_LECTURA), true);
  });

  it("route restrictions match FRD §2", () => {
    for (const role of roles) {
      assert.equal(
        isTenantRouteAllowed(role, "/configuracion"),
        role === TenantRole.ADMIN_TENANT,
      );
      assert.equal(
        isTenantRouteAllowed(role, "/conductores/nuevo"),
        role === TenantRole.ADMIN_TENANT || role === TenantRole.GESTOR,
      );
      assert.equal(
        isTenantRouteAllowed(role, "/conductores/abc/editar"),
        role === TenantRole.ADMIN_TENANT || role === TenantRole.GESTOR,
      );
      assert.equal(
        isTenantRouteAllowed(role, "/cerrar-turnos"),
        role === TenantRole.ADMIN_TENANT || role === TenantRole.GESTOR,
      );
      assert.equal(isTenantRouteAllowed(role, "/dashboard"), true);
      assert.equal(isTenantRouteAllowed(role, "/facturacion"), true);
    }
  });

  it("tenant users API is admin-only path prefix", () => {
    assert.equal(isTenantUsersAdminApiPath("/api/tenant/users/invite"), true);
    assert.equal(isTenantUsersAdminApiPath("/api/tenant/users/u1/resend-invite"), true);
    assert.equal(isTenantUsersAdminApiPath("/api/tenant/drivers"), false);
  });

  it("company write routes and API are admin-only", () => {
    assert.equal(isTenantRouteAllowed(TenantRole.GESTOR, "/empresas/nuevo"), false);
    assert.equal(isTenantRouteAllowed(TenantRole.ADMIN_TENANT, "/empresas/abc/editar"), true);
    assert.equal(isTenantCompaniesAdminApiPath("/api/tenant/companies"), true);
    assert.equal(isTenantCompaniesAdminApiPath("/api/tenant/companies/u1"), true);
  });

  it("liquidation PDF/preview POST paths are export routes", () => {
    assert.equal(isTenantShiftLiquidationExportPostPath("/api/tenant/shifts/liquidation-pdf"), true);
    assert.equal(
      isTenantShiftLiquidationExportPostPath("/api/tenant/shifts/liquidation-preview"),
      true,
    );
    assert.equal(isTenantShiftLiquidationExportPostPath("/api/tenant/shifts/close"), false);
  });
});
