import { getTenantIntegrationSettings } from "@fleethub/auth";
import {
  findFleetCompanyForFreenowName,
  listAllFreenowLinkedCompanies,
  resolveFreenowFleetCompanyMappings,
  resolveTenantFreenowPublicCompanyIds,
} from "./freenow-company-map.js";
import { freenowLinkedCompanyName } from "./freenow-client.js";
import { importFreenowDriversForTenant } from "./freenow-import-drivers.js";
import { linkFreenowDriversForTenant } from "./freenow-link-drivers.js";
import { resolveTenantFreenowPublicCompanyId } from "./tenant-platform-config.js";
import { withTenant } from "@fleethub/db";
import { importUberDriversForTenant } from "./uber-import-drivers.js";
import { linkUberDriversForTenant } from "./uber-link-drivers.js";
import { uberAutoImportEnabledForTenantSlug } from "./uber-auto-import-tenants.js";

async function resolveTenantSlug(tenantId: string): Promise<string | null> {
  return withTenant(tenantId, async (tx) => {
    const row = await tx.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
    return row?.slug ?? null;
  });
}

export type PlatformDriverSyncResult =
  | {
      ok: true;
      /** New FleetHub driver rows created from platform API. */
      created: number;
      /** FleetHub drivers linked/updated with platform external ids. */
      linked: number;
      platformDrivers: number;
    }
  | { ok: false; message: string };

/**
 * Uber driver sync on automatic poll:
 * - Always link FleetHub drivers already in the tenant (name match → external id).
 * - Bulk import from the tenant's Uber org when enabled (dedicated-org tenants: trevino, trade-taxi-sl).
 *   Shared orgs (cosculluela) must not auto-clone — use UBER_SYNC_IMPORT_ALL_DRIVERS=1 only in dev.
 */
export async function syncUberDriversForTenant(tenantId: string): Promise<PlatformDriverSyncResult> {
  let created = 0;
  const slug = await resolveTenantSlug(tenantId);
  if (uberAutoImportEnabledForTenantSlug(slug)) {
    const imported = await importUberDriversForTenant(tenantId);
    if (!imported.ok) {
      return { ok: false, message: imported.message };
    }
    created = imported.created;
    if (imported.created > 0) {
      console.log(
        `[uber] auto-import ${slug ?? tenantId.slice(0, 8)}: +${imported.created} driver(s), ${imported.linked}/${imported.total} linked.`,
      );
    }
  }

  const linked = await linkUberDriversForTenant(tenantId);
  if (linked.message) {
    return { ok: false, message: linked.message };
  }

  return {
    ok: true,
    created,
    linked: linked.linked,
    platformDrivers: linked.uberDrivers,
  };
}

function freenowAutoImportEnabled(): boolean {
  const v = process.env.FREENOW_SYNC_IMPORT_ALL_DRIVERS?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Import new ACTIVE drivers when mapped to a fleet empresa, or when globally enabled. */
function shouldImportFreenowDrivers(options?: { fleetCompanyId?: string }): boolean {
  if (freenowAutoImportEnabled()) return true;
  return Boolean(options?.fleetCompanyId);
}

/**
 * FreeNow driver sync for one public company id — import new ACTIVE drivers (when allowed), then link by name.
 */
export async function syncFreenowDriversForTenant(
  tenantId: string,
  publicCompanyId: string,
  options?: { fleetCompanyId?: string },
): Promise<PlatformDriverSyncResult> {
  let created = 0;
  if (shouldImportFreenowDrivers(options)) {
    const imported = await importFreenowDriversForTenant(tenantId, publicCompanyId, options);
    if (!imported.ok) {
      return { ok: false, message: imported.message };
    }
    created = imported.created;
    if (imported.created > 0) {
      console.log(
        `[freenow] auto-import ${publicCompanyId}: +${imported.created} driver(s), ${imported.linked}/${imported.total} linked.`,
      );
    }
  }

  const linked = await linkFreenowDriversForTenant(tenantId, publicCompanyId, options);
  if (linked.message) {
    return { ok: false, message: linked.message };
  }

  return {
    ok: true,
    created,
    linked: linked.linked,
    platformDrivers: linked.freenowDrivers,
  };
}

/**
 * Sync FreeNow drivers for every company on the fleet umbrella token.
 * Auto-imports new ACTIVE drivers into the mapped FleetHub empresa, then links/updates ids.
 */
export async function syncFreenowDriversForAllLinkedCompanies(
  tenantId: string,
): Promise<PlatformDriverSyncResult> {
  const linked = await listAllFreenowLinkedCompanies();
  if (!linked.ok) {
    const publicCompanyId = await resolveTenantFreenowPublicCompanyId(tenantId);
    return syncFreenowDriversForTenant(tenantId, publicCompanyId);
  }

  const fleetCompanies = await withTenant(tenantId, (tx) =>
    tx.company.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, legalName: true },
    }),
  );

  const settings = await getTenantIntegrationSettings(tenantId);
  const tenantCompanyIds = settings.freenowPublicCompanyId.trim()
    ? new Set(await resolveTenantFreenowPublicCompanyIds(tenantId))
    : null;

  let createdCount = 0;
  let linkedCount = 0;
  let platformDrivers = 0;

  for (const fnCompany of linked.companies) {
    const publicCompanyId = fnCompany.id?.trim();
    if (!publicCompanyId) continue;
    if (tenantCompanyIds && !tenantCompanyIds.has(publicCompanyId)) continue;
    const fnName = freenowLinkedCompanyName(fnCompany);
    const fleet = findFleetCompanyForFreenowName(fleetCompanies, fnName);

    const result = await syncFreenowDriversForTenant(tenantId, publicCompanyId, {
      fleetCompanyId: fleet?.id,
    });
    if (!result.ok) return result;
    createdCount += result.created;
    linkedCount += result.linked;
    platformDrivers += result.platformDrivers;
    if (result.created > 0 || result.linked > 0) {
      console.log(
        `[freenow] sync ${publicCompanyId} (${fnName})${fleet ? ` ↔ ${fleet.legalName}` : ""}: +${result.created} created, +${result.linked} linked.`,
      );
    }
  }

  // Tenant-wide pass on primary id — link only (no bulk import without empresa mapping).
  const mappings = await resolveFreenowFleetCompanyMappings(tenantId);
  const primaryId = await resolveTenantFreenowPublicCompanyId(tenantId);
  if (primaryId) {
    const fallback = await syncFreenowDriversForTenant(tenantId, primaryId);
    if (!fallback.ok) return fallback;
    createdCount += fallback.created;
    linkedCount += fallback.linked;
    platformDrivers = Math.max(platformDrivers, fallback.platformDrivers);
    if (fallback.created > 0 || fallback.linked > 0) {
      console.log(
        `[freenow] umbrella sync ${primaryId}: +${fallback.created} created, +${fallback.linked} linked.`,
      );
    }
  }

  if (mappings.length > 0 && linkedCount === 0 && createdCount === 0) {
    for (const mapping of mappings) {
      const result = await syncFreenowDriversForTenant(tenantId, mapping.publicCompanyId, {
        fleetCompanyId: mapping.fleetCompanyId,
      });
      if (!result.ok) return result;
      createdCount += result.created;
      linkedCount += result.linked;
      platformDrivers += result.platformDrivers;
    }
  }

  if (linkedCount > 0 || createdCount > 0 || linked.companies.length > 0) {
    for (const fnCompany of linked.companies) {
      const publicCompanyId = fnCompany.id?.trim();
      if (!publicCompanyId) continue;
      if (tenantCompanyIds && !tenantCompanyIds.has(publicCompanyId)) continue;
      const weak = await linkFreenowDriversForTenant(tenantId, publicCompanyId, {
        weakIdsOnly: true,
      });
      if (weak.message) return { ok: false, message: weak.message };
      if (weak.linked > 0) {
        linkedCount += weak.linked;
        console.log(
          `[freenow] weak-id upgrade ${publicCompanyId}: +${weak.linked} driver(s).`,
        );
      }
    }
  }

  return { ok: true, created: createdCount, linked: linkedCount, platformDrivers };
}
