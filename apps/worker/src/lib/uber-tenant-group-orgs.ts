/**
 * Multi-org Uber sync for group tenants (e.g. cosculluela: Badavi + Galera + Santacoloma…).
 */
import { withTenant } from "@fleethub/db";
import { normalizeCompanyMatchKey } from "./freenow-company-map.js";
import {
  defaultUberOrgForTenantSlug,
  type UberOrgRef,
  UBER_ORG_NAME_ALIASES,
} from "./uber-tenant-org-map.js";
import { listUberOrganizations, resolveUberOrgId, type UberFleetResult } from "./uber-fleet-client.js";
import { resolveTenantUberOrgId } from "./tenant-platform-config.js";

/** Orgs owned by other FleetHub tenants on the shared Uber umbrella. */
export const UBER_GROUP_EXCLUDED_ORG_NAME_PARTS = ["tradetaxi", "trade taxi", "taxi business"];

export const UBER_SYNC_ORG_METADATA_KEY = "uberSyncOrgId";
export const UBER_SYNC_ORG_NAME_METADATA_KEY = "uberSyncOrgName";

function pickEnv(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v : undefined;
}

export function uberMultiOrgSyncEnabled(slug: string | null | undefined): boolean {
  const flag = pickEnv("UBER_SYNC_MULTI_ORG")?.toLowerCase();
  if (flag === "0" || flag === "false" || flag === "no") return false;
  if (flag === "1" || flag === "true" || flag === "yes") return true;
  return slug === "cosculluela";
}

function isExcludedGroupOrg(orgName: string): boolean {
  const lower = orgName.toLowerCase();
  return UBER_GROUP_EXCLUDED_ORG_NAME_PARTS.some((part) => lower.includes(part));
}

export function orgMatchesFleetCompany(orgName: string, fleetLegalName: string): boolean {
  const a = normalizeCompanyMatchKey(orgName);
  const b = normalizeCompanyMatchKey(fleetLegalName);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 6 && b.length >= 6) {
    return a.includes(b) || b.includes(a);
  }
  return false;
}

export function uberSyncOrgIdFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = (metadata as Record<string, unknown>)[UBER_SYNC_ORG_METADATA_KEY];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function resolveTenantSlug(tenantId: string): Promise<string | null> {
  return withTenant(tenantId, async (tx) => {
    const row = await tx.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
    return row?.slug ?? null;
  });
}

/** Primary + sibling orgs on the Uber umbrella for this tenant (cosculluela group). */
export async function resolveTenantUberOrgIds(
  tenantId: string,
): Promise<UberFleetResult<UberOrgRef[]>> {
  const slug = await resolveTenantSlug(tenantId);
  const primaryOverride = await resolveTenantUberOrgId(tenantId);
  const primary = await resolveUberOrgId(primaryOverride);
  if (!primary.ok) return primary;

  const defaultRef = slug ? defaultUberOrgForTenantSlug(slug) : undefined;
  const primaryRef: UberOrgRef = {
    orgId: primary.data,
    orgName: defaultRef?.orgName ?? "primary",
  };

  if (!uberMultiOrgSyncEnabled(slug)) {
    return { ok: true, data: [primaryRef] };
  }

  const listed = await listUberOrganizations();
  if (!listed.ok) {
    return { ok: true, data: [primaryRef] };
  }

  const refs: UberOrgRef[] = [];
  const seen = new Set<string>();

  for (const org of listed.data) {
    const name = (org.name ?? "").trim();
    if (!org.id || seen.has(org.id)) continue;
    if (isExcludedGroupOrg(name)) continue;
    seen.add(org.id);
    refs.push({ orgId: org.id, orgName: name || org.id.slice(0, 16) });
  }

  if (refs.length === 0) {
    return { ok: true, data: [primaryRef] };
  }

  refs.sort((a, b) => {
    if (a.orgId === primaryRef.orgId) return -1;
    if (b.orgId === primaryRef.orgId) return 1;
    return a.orgName.localeCompare(b.orgName, "es");
  });

  return { ok: true, data: refs };
}

/** Order org ids: metadata hint → primary → rest. */
export function orderUberOrgIds(
  orgs: UberOrgRef[],
  preferredOrgId: string | null | undefined,
): UberOrgRef[] {
  if (!preferredOrgId) return orgs;
  const idx = orgs.findIndex((o) => o.orgId === preferredOrgId);
  if (idx <= 0) return orgs;
  return [orgs[idx]!, ...orgs.filter((_, i) => i !== idx)];
}

export function tenantSlugAcceptsUberOrg(slug: string | null, orgName: string): boolean {
  if (!slug) return false;
  const aliases = UBER_ORG_NAME_ALIASES[slug] ?? [];
  const defaultRef = defaultUberOrgForTenantSlug(slug);
  const targets = [defaultRef?.orgName ?? "", ...aliases].filter(Boolean);
  const n = normalizeCompanyMatchKey(orgName);
  return targets.some((t) => {
    const key = normalizeCompanyMatchKey(t);
    return key.length > 0 && (n.includes(key) || key.includes(n));
  });
}

export async function persistDriverUberSyncOrgId(
  tenantId: string,
  driverPlatformAccountId: string,
  org: UberOrgRef,
): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    const dpa = await tx.driverPlatformAccount.findFirst({
      where: { id: driverPlatformAccountId, tenantId },
      select: { id: true, metadata: true },
    });
    if (!dpa) return;
    if (uberSyncOrgIdFromMetadata(dpa.metadata) === org.orgId) return;

    await tx.driverPlatformAccount.update({
      where: { id: dpa.id },
      data: {
        metadata: {
          ...(typeof dpa.metadata === "object" && dpa.metadata
            ? (dpa.metadata as Record<string, unknown>)
            : {}),
          [UBER_SYNC_ORG_METADATA_KEY]: org.orgId,
          [UBER_SYNC_ORG_NAME_METADATA_KEY]: org.orgName,
          uberSyncOrgDiscoveredAt: new Date().toISOString(),
        },
      },
    });
  });
}
