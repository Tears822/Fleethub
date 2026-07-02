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

function uberAutoImportEnabled(): boolean {
  const v = process.env.UBER_SYNC_IMPORT_ALL_DRIVERS?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
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
 * - Bulk import of every Uber org driver is opt-in only (UBER_SYNC_IMPORT_ALL_DRIVERS=1).
 *   Shared orgs must not auto-clone drivers into every tenant.
 */
export async function syncUberDriversForTenant(tenantId: string): Promise<PlatformDriverSyncResult> {
  let created = 0;
  if (uberAutoImportEnabled()) {
    const imported = await importUberDriversForTenant(tenantId);
    if (!imported.ok) {
      return { ok: false, message: imported.message };
    }
    created = imported.created;
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

/**
 * FreeNow driver sync — bulk import opt-in only (shared umbrella must not clone drivers).
 */
export async function syncFreenowDriversForTenant(
  tenantId: string,
  publicCompanyId: string,
  options?: { fleetCompanyId?: string },
): Promise<PlatformDriverSyncResult> {
  let created = 0;
  if (freenowAutoImportEnabled()) {
    const imported = await importFreenowDriversForTenant(tenantId, publicCompanyId, options);
    if (!imported.ok) {
      return { ok: false, message: imported.message };
    }
    created = imported.created;
  }

  const linked = await linkFreenowDriversForTenant(tenantId, publicCompanyId);
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
 * Link FleetHub drivers to FreeNow for every company on the fleet umbrella token.
 * Upgrades spreadsheet short codes (e.g. 1137JP) to public API ids when names match.
 */
export async function syncFreenowDriversForAllLinkedCompanies(
  tenantId: string,
): Promise<PlatformDriverSyncResult> {
  const linked = await listAllFreenowLinkedCompanies();
  if (!linked.ok) {
    const publicCompanyId = await resolveTenantFreenowPublicCompanyId(tenantId);
    const result = await linkFreenowDriversForTenant(tenantId, publicCompanyId);
    if (result.message) return { ok: false, message: result.message };
    return {
      ok: true,
      created: 0,
      linked: result.linked,
      platformDrivers: result.freenowDrivers,
    };
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

  let linkedCount = 0;
  let platformDrivers = 0;

  for (const fnCompany of linked.companies) {
    const publicCompanyId = fnCompany.id?.trim();
    if (!publicCompanyId) continue;
    if (tenantCompanyIds && !tenantCompanyIds.has(publicCompanyId)) continue;
    const fnName = freenowLinkedCompanyName(fnCompany);
    const fleet = findFleetCompanyForFreenowName(fleetCompanies, fnName);

    const result = await linkFreenowDriversForTenant(tenantId, publicCompanyId, {
      fleetCompanyId: fleet?.id,
    });
    if (result.message) return { ok: false, message: result.message };
    linkedCount += result.linked;
    platformDrivers += result.freenowDrivers;
    console.log(
      `[freenow] link ${publicCompanyId} (${fnName})${fleet ? ` ↔ ${fleet.legalName}` : ""}: +${result.linked} driver(s).`,
    );
  }

  // Tenant-wide pass on primary id — upgrades drivers whose empresa name did not match FN company label.
  const mappings = await resolveFreenowFleetCompanyMappings(tenantId);
  const primaryId = await resolveTenantFreenowPublicCompanyId(tenantId);
  if (primaryId) {
    const fallback = await linkFreenowDriversForTenant(tenantId, primaryId);
    if (fallback.message) return { ok: false, message: fallback.message };
    linkedCount += fallback.linked;
    platformDrivers = Math.max(platformDrivers, fallback.freenowDrivers);
    if (fallback.linked > 0) {
      console.log(`[freenow] umbrella link ${primaryId}: +${fallback.linked} driver(s).`);
    }
  }

  if (mappings.length > 0 && linkedCount === 0) {
    for (const mapping of mappings) {
      const result = await linkFreenowDriversForTenant(tenantId, mapping.publicCompanyId, {
        fleetCompanyId: mapping.fleetCompanyId,
      });
      if (result.message) return { ok: false, message: result.message };
      linkedCount += result.linked;
      platformDrivers += result.freenowDrivers;
    }
  }

  if (linkedCount > 0 || linked.companies.length > 0) {
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

  return { ok: true, created: 0, linked: linkedCount, platformDrivers };
}
