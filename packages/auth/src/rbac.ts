import { TenantRole } from "@prisma/client";

export type TenantRoleLike = TenantRole | string;

export function parseTenantRole(role: string): TenantRole | null {
  if (Object.values(TenantRole).includes(role as TenantRole)) {
    return role as TenantRole;
  }
  return null;
}

/** FRD §2 — configuración / usuarios del tenant: solo Admin */
export function canManageTenantSettings(role: TenantRoleLike): boolean {
  return role === TenantRole.ADMIN_TENANT;
}

/** Empresas (alta/edición futura): solo Admin */
export function canManageCompanies(role: TenantRoleLike): boolean {
  return role === TenantRole.ADMIN_TENANT;
}

/** Conductores: Admin + Gestor */
export function canManageDrivers(role: TenantRoleLike): boolean {
  return role === TenantRole.ADMIN_TENANT || role === TenantRole.GESTOR;
}

/** Cerrar turnos y operativa con escritura: Admin + Gestor */
export function canManageShifts(role: TenantRoleLike): boolean {
  return role === TenantRole.ADMIN_TENANT || role === TenantRole.GESTOR;
}

/** Reopen a closed shift for correction — tenant administrators only (FRD §7.5). */
export function canReopenClosedShift(role: TenantRoleLike): boolean {
  return role === TenantRole.ADMIN_TENANT;
}

/** Solo lectura: ver y exportar, sin escritura operativa ni configuración */
export function isReadOnly(role: TenantRoleLike): boolean {
  return role === TenantRole.SOLO_LECTURA;
}

/** Exportación CSV / informes: todos los roles del tenant */
export function canExportTenantData(role: TenantRoleLike): boolean {
  return (
    role === TenantRole.ADMIN_TENANT ||
    role === TenantRole.GESTOR ||
    role === TenantRole.SOLO_LECTURA
  );
}

export type TenantRouteRestriction = "config" | "driver-write" | "close-shifts" | "company-write";

export function getTenantRouteRestriction(pathname: string): TenantRouteRestriction | null {
  if (pathname === "/configuracion" || pathname.startsWith("/configuracion/")) {
    return "config";
  }
  if (
    pathname === "/conductores/nuevo" ||
    pathname.startsWith("/conductores/nuevo/") ||
    /\/conductores\/[^/]+\/editar\/?$/.test(pathname)
  ) {
    return "driver-write";
  }
  if (pathname === "/cerrar-turnos" || pathname.startsWith("/cerrar-turnos/")) {
    return "close-shifts";
  }
  if (
    pathname === "/empresas/nuevo" ||
    pathname.startsWith("/empresas/nuevo/") ||
    /\/empresas\/[^/]+\/editar\/?$/.test(pathname)
  ) {
    return "company-write";
  }
  return null;
}

export function redirectPathForRestriction(restriction: TenantRouteRestriction): string {
  if (restriction === "config") return "/dashboard";
  if (restriction === "driver-write") return "/conductores";
  if (restriction === "company-write") return "/empresas";
  return "/turnos-cerrados";
}

export function isTenantRouteAllowed(role: TenantRoleLike, pathname: string): boolean {
  const restriction = getTenantRouteRestriction(pathname);
  if (!restriction) return true;
  if (restriction === "config") return canManageTenantSettings(role);
  if (restriction === "driver-write") return canManageDrivers(role);
  if (restriction === "close-shifts") return canManageShifts(role);
  if (restriction === "company-write") return canManageCompanies(role);
  return true;
}

/** API paths that mutate tenant users — Admin only (Gestor blocked even if guard slips). */
export function isTenantUsersAdminApiPath(pathname: string): boolean {
  const path = pathname.split("?")[0] ?? "";
  return path.startsWith("/api/tenant/users");
}

/** API paths that mutate companies — Admin only. */
export function isTenantCompaniesAdminApiPath(pathname: string): boolean {
  const path = pathname.split("?")[0] ?? "";
  return path.startsWith("/api/tenant/companies");
}

/** API paths that mutate tenant settings — Admin only. */
export function isTenantSettingsAdminApiPath(pathname: string): boolean {
  const path = pathname.split("?")[0] ?? "";
  return path.startsWith("/api/tenant/settings");
}

/** API paths for notification prefs and manual digest — Admin only. */
export function isTenantNotificationsAdminApiPath(pathname: string): boolean {
  const path = pathname.split("?")[0] ?? "";
  return (
    path.startsWith("/api/tenant/notifications/send-digest") ||
    path === "/api/tenant/settings/notifications"
  );
}

/** POST exports (PDF / preview) — read-only; not blocked by solo lectura or SA impersonation. */
export function isTenantShiftLiquidationExportPostPath(pathname: string): boolean {
  const path = pathname.split("?")[0] ?? "";
  return (
    path === "/api/tenant/shifts/liquidation-pdf" ||
    path === "/api/tenant/shifts/liquidation-preview"
  );
}
