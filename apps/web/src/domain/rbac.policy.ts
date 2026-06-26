/** Re-export FRD §2 RBAC matrix from @fleethub/auth (single source of truth). */
export {
  parseTenantRole,
  canManageTenantSettings,
  canManageCompanies,
  canManageDrivers,
  canManageShifts,
  canReopenClosedShift,
  isReadOnly,
  canExportTenantData,
  getTenantRouteRestriction,
  redirectPathForRestriction,
  isTenantRouteAllowed,
  type TenantRouteRestriction,
} from "@fleethub/auth/rbac";
