export function isProductionEnv(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Super Admin must use 2FA in production; staging/dev has no extra restriction. */
export function isPlatformMfaMandatory(): boolean {
  return isProductionEnv();
}

/** Tenant Admin must enable 2FA in production (FRD / SPEC 1.11). */
export function isTenantAdminMfaMandatory(): boolean {
  return isProductionEnv();
}
