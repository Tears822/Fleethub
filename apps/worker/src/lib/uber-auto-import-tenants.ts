/**
 * Tenants with a dedicated Uber org (not shared Badavi umbrella).
 * Safe to bulk-import the full Uber driver roster on each sync.
 */
export const UBER_DEDICATED_ORG_TENANT_SLUGS = ["trevino", "trade-taxi-sl"] as const;

function parseSlugList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Global kill-switch: import all Uber drivers into every tenant (dev only). */
export function uberAutoImportAllTenantsEnabled(): boolean {
  const v = process.env.UBER_SYNC_IMPORT_ALL_DRIVERS?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Per-tenant allowlist via env (comma-separated slugs). */
export function uberAutoImportTenantSlugsFromEnv(): string[] {
  return parseSlugList(process.env.UBER_SYNC_AUTO_IMPORT_TENANTS);
}

export function uberAutoImportEnabledForTenantSlug(slug: string | null | undefined): boolean {
  if (!slug) return false;
  if (uberAutoImportAllTenantsEnabled()) return true;
  const normalized = slug.trim().toLowerCase();
  const fromEnv = uberAutoImportTenantSlugsFromEnv();
  if (fromEnv.length > 0) {
    return fromEnv.includes(normalized);
  }
  return (UBER_DEDICATED_ORG_TENANT_SLUGS as readonly string[]).includes(normalized);
}
