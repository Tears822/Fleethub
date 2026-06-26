/**
 * Map FleetHub tenant → Uber Vehicle Suppliers org (sub-org under umbrella account).
 * Prevents syncing Tradetaxi drivers from the shared BADAVI/parent org.
 */

export type UberOrgRef = { orgId: string; orgName: string };

/** Default org ids from Uber API (override via env UBER_ORG_ID_<SLUG>). */
export const DEFAULT_UBER_ORG_BY_TENANT_SLUG: Record<string, UberOrgRef> = {
  cosculluela: {
    orgName: "Badavi S.L.",
    orgId:
      "8MKpeq-qtAElQy366IG6HoAN9_z0kDaIJh6fTpvN1v8Imfei3JYCNnCbgsIt2Ta4JB0pgpclsFfqP1Uhca5bguqnlXr9ADz-sU0hV6uXHuiT05pa8pmS5Vapf4bPOGoemw==",
  },
  "trade-taxi-sl": {
    orgName: "Tradetaxis S.L.",
    orgId:
      "8MKpeq-qtAElQy366IG6HoAN9_z0kDaIJh6fTpvN1v8IQYw15J4rf_M9v7JJDsB8HBU-bsYm_CgxyeKIUbKikaiUcadR8xJU3QvBZ4zbE7NvkvoEwdtkaTd2j-Kp_J1i_A==",
  },
  trevino: {
    orgName: "TAXI Business S.L.",
    orgId:
      "8MKpeq-qtAElQy366IG6HoAN9_z0kDaIJh6fTpvN1v8I_ojvd8IVMDsHK8aCf1UqJDNuf9t_hFmv-LaWYEWHL_oQdPnMHpHM669AlDIBboA8Ab56WWBJ1dnglR2ML2Q47g==",
  },
};

/** Alternate Uber org names accepted when resolving from API list. */
export const UBER_ORG_NAME_ALIASES: Record<string, string[]> = {
  cosculluela: ["badavi"],
  "trade-taxi-sl": ["tradetaxi", "trade taxi"],
  trevino: ["taxi business"],
};

function pickEnv(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v : undefined;
}

export function uberOrgEnvVarForTenantSlug(slug: string): string {
  return `UBER_ORG_ID_${slug.toUpperCase().replace(/-/g, "_")}`;
}

/** Legacy single-org env (umbrella / parent). Not used for mapped group tenants. */
export function defaultUberOrgIdFromEnv(): string | undefined {
  return pickEnv("UBER_ORG_ID");
}

export function uberOrgIdFromEnvForTenantSlug(slug: string): string | undefined {
  return (
    pickEnv(uberOrgEnvVarForTenantSlug(slug)) ??
    (slug === "trade-taxi-sl" ? pickEnv("UBER_TRADETAXI_ORG_ID") : undefined)
  );
}

export function defaultUberOrgForTenantSlug(slug: string): UberOrgRef | undefined {
  const envId = uberOrgIdFromEnvForTenantSlug(slug);
  const fallback = DEFAULT_UBER_ORG_BY_TENANT_SLUG[slug];
  if (envId) {
    return { orgId: envId, orgName: fallback?.orgName ?? slug };
  }
  return fallback;
}

export function normalizeOrgName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function uberOrgMatchesTenant(orgName: string, tenantSlug: string): boolean {
  const ref = DEFAULT_UBER_ORG_BY_TENANT_SLUG[tenantSlug];
  if (!ref) return false;
  const n = normalizeOrgName(orgName);
  const targets = [ref.orgName, ...(UBER_ORG_NAME_ALIASES[tenantSlug] ?? [])].map(normalizeOrgName);
  return targets.some((t) => n.includes(t) || t.includes(n));
}

export type UberOrganizationRow = { id: string; name?: string | null };

export function findUberOrgForTenant(
  organizations: UberOrganizationRow[],
  tenantSlug: string,
): UberOrgRef | undefined {
  const match = organizations.find((o) => o.name && uberOrgMatchesTenant(o.name, tenantSlug));
  if (match?.id) {
    return { orgId: match.id, orgName: match.name!.trim() };
  }
  return defaultUberOrgForTenantSlug(tenantSlug);
}
