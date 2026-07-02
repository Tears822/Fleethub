import { RidePlatform, withTenant } from "@fleethub/db";
import {
  listAllUberDrivers,
  uberDriverDisplayName,
  uberDriverExternalId,
} from "./uber-fleet-client.js";
import { externalDriverIdTakenByOther } from "./platform-account-link-guard.js";
import {
  orgMatchesFleetCompany,
  resolveTenantUberOrgIds,
  UBER_SYNC_ORG_METADATA_KEY,
  UBER_SYNC_ORG_NAME_METADATA_KEY,
  type UberOrgRef,
} from "./uber-tenant-group-orgs.js";

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function firstLastKey(name: string): string | null {
  const parts = normalizeName(name).split(" ").filter(Boolean);
  if (parts.length < 2) return null;
  return `${parts[0]}|${parts[parts.length - 1]}`;
}

type UberDriverHit = { uuid: string; org: UberOrgRef };

function pickUberHit(
  hits: UberDriverHit[],
  companyLegalName: string,
): UberDriverHit | undefined {
  if (hits.length === 0) return undefined;
  if (hits.length === 1) return hits[0];

  const byCompany = hits.filter((h) => orgMatchesFleetCompany(h.org.orgName, companyLegalName));
  if (byCompany.length === 1) return byCompany[0];
  if (byCompany.length > 1) return byCompany[0];

  return hits[0];
}

/**
 * Match FleetHub drivers to Uber UUIDs across all group orgs (name + empresa).
 * Stores uberSyncOrgId on driver_platform_accounts for report sync.
 */
export async function linkUberDriversForTenant(tenantId: string): Promise<{
  linked: number;
  uberDrivers: number;
  message?: string;
}> {
  const orgsResult = await resolveTenantUberOrgIds(tenantId);
  if (!orgsResult.ok) {
    return { linked: 0, uberDrivers: 0, message: orgsResult.message };
  }

  const hitsByName = new Map<string, UberDriverHit[]>();
  const hitsByFirstLast = new Map<string, UberDriverHit[]>();
  let platformDriverCount = 0;

  for (const org of orgsResult.data) {
    const uberDrivers = await listAllUberDrivers(org.orgId);
    if (!uberDrivers.ok) {
      console.warn(`[uber] link drivers org ${org.orgName}:`, uberDrivers.message);
      continue;
    }
    platformDriverCount += uberDrivers.data.length;

    for (const row of uberDrivers.data) {
      const extId = uberDriverExternalId(row);
      const name = uberDriverDisplayName(row);
      if (!extId || !name) continue;
      const hit: UberDriverHit = { uuid: extId, org };

      const nk = normalizeName(name);
      const nameList = hitsByName.get(nk) ?? [];
      nameList.push(hit);
      hitsByName.set(nk, nameList);

      const fl = firstLastKey(name);
      if (fl) {
        const flList = hitsByFirstLast.get(fl) ?? [];
        flList.push(hit);
        hitsByFirstLast.set(fl, flList);
      }
    }
  }

  if (platformDriverCount === 0) {
    return { linked: 0, uberDrivers: 0, message: "No Uber drivers returned from org API" };
  }

  let linked = 0;

  await withTenant(tenantId, async (tx) => {
    const drivers = await tx.driver.findMany({
      where: { tenantId, isActive: true },
      select: {
        id: true,
        fullName: true,
        company: { select: { legalName: true } },
      },
    });

    for (const driver of drivers) {
      const companyName = driver.company.legalName;
      const nameHits = hitsByName.get(normalizeName(driver.fullName)) ?? [];
      const flKey = firstLastKey(driver.fullName);
      const flHits = flKey ? (hitsByFirstLast.get(flKey) ?? []) : [];
      const merged = [...nameHits, ...flHits.filter((h) => !nameHits.includes(h))];
      const picked = pickUberHit(merged, companyName);
      if (!picked) continue;

      const uberId = picked.uuid;
      const existing = await tx.driverPlatformAccount.findFirst({
        where: { tenantId, driverId: driver.id, platform: RidePlatform.UBER },
      });

      if (existing) {
        const sameId =
          existing.externalDriverId.toLowerCase() === uberId.toLowerCase() && existing.isActive;
        const sameOrg =
          (existing.metadata as Record<string, unknown> | null)?.[UBER_SYNC_ORG_METADATA_KEY] ===
          picked.org.orgId;
        if (sameId && sameOrg) continue;

        if (await externalDriverIdTakenByOther(tx, tenantId, RidePlatform.UBER, uberId, driver.id)) {
          continue;
        }

        await tx.driverPlatformAccount.update({
          where: { id: existing.id },
          data: {
            externalDriverId: uberId,
            isActive: true,
            metadata: {
              ...(typeof existing.metadata === "object" && existing.metadata
                ? (existing.metadata as Record<string, unknown>)
                : {}),
              uberLinkedAt: new Date().toISOString(),
              uberDisplayName: driver.fullName,
              [UBER_SYNC_ORG_METADATA_KEY]: picked.org.orgId,
              [UBER_SYNC_ORG_NAME_METADATA_KEY]: picked.org.orgName,
            },
          },
        });
      } else {
        if (await externalDriverIdTakenByOther(tx, tenantId, RidePlatform.UBER, uberId, driver.id)) {
          continue;
        }

        await tx.driverPlatformAccount.create({
          data: {
            tenantId,
            driverId: driver.id,
            platform: RidePlatform.UBER,
            externalDriverId: uberId,
            metadata: {
              uberLinkedAt: new Date().toISOString(),
              uberDisplayName: driver.fullName,
              [UBER_SYNC_ORG_METADATA_KEY]: picked.org.orgId,
              [UBER_SYNC_ORG_NAME_METADATA_KEY]: picked.org.orgName,
            },
          },
        });
      }
      linked += 1;
    }
  });

  if (linked > 0) {
    console.log(
      `[uber] linked ${linked} driver(s) across ${orgsResult.data.length} org(s) (API roster ${platformDriverCount}).`,
    );
  }

  return { linked, uberDrivers: platformDriverCount };
}
