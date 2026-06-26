import type { TenantCommercialStatus } from "@fleethub/db";

export type TenantAccessRow = {
  commercialStatus: TenantCommercialStatus;
  trialEndsAt: Date | null;
};

/** Returns a user-facing message when login must be blocked, or null if allowed. */
export function tenantLoginBlockedMessage(tenant: TenantAccessRow): string | null {
  if (tenant.commercialStatus === "SUSPENDED") {
    return "Cuenta suspendida. Contacta con soporte de FleetHub.";
  }
  if (
    tenant.commercialStatus === "TRIAL" &&
    tenant.trialEndsAt &&
    tenant.trialEndsAt.getTime() < Date.now()
  ) {
    return "Periodo de prueba finalizado. Contacta con soporte.";
  }
  return null;
}

export function commercialStatusLabel(status: TenantCommercialStatus): string {
  if (status === "TRIAL") return "Prueba";
  if (status === "SUSPENDED") return "Suspendido";
  return "Activo";
}
