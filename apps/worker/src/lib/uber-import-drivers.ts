import { isLikelyFleetEntityDriverName } from "@fleethub/auth";
import { RidePlatform, withTenant } from "@fleethub/db";
import {
  listAllUberDrivers,
  listUberOrganizations,
  resolveUberOrgId,
  uberDriverDisplayName,
  uberDriverExternalId,
} from "./uber-fleet-client.js";
import { resolveTenantUberOrgId } from "./tenant-platform-config.js";

/** Import Uber org drivers into FleetHub (creates drivers + UBER platform accounts). */
export async function importUberDriversForTenant(tenantId: string): Promise<
  | { ok: true; created: number; linked: number; total: number; orgId: string }
  | { ok: false; message: string }
> {
  const orgOverride = await resolveTenantUberOrgId(tenantId);
  const org = await resolveUberOrgId(orgOverride);
  if (!org.ok) {
    return { ok: false, message: org.message };
  }

  const api = await listAllUberDrivers(org.data);
  if (!api.ok) {
    return { ok: false, message: api.message };
  }

  const orgs = await listUberOrganizations();
  const fleetOrgNames = orgs.ok
    ? orgs.data.map((o) => o.name ?? "").filter(Boolean)
    : [];

  let created = 0;
  let linked = 0;

  await withTenant(tenantId, async (tx) => {
    const company = await tx.company.findFirst({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
    });
    if (!company) {
      throw new Error("Tenant has no company row");
    }

    const fleetCompanyNames = (
      await tx.company.findMany({
        where: { tenantId },
        select: { legalName: true },
      })
    ).map((c) => c.legalName);

    for (const row of api.data) {
      const externalDriverId = uberDriverExternalId(row);
      const fullName = uberDriverDisplayName(row);
      if (!externalDriverId || !fullName) continue;
      if (isLikelyFleetEntityDriverName(fullName, [...fleetOrgNames, ...fleetCompanyNames])) {
        continue;
      }

      const existingByExt = await tx.driverPlatformAccount.findFirst({
        where: { tenantId, platform: RidePlatform.UBER, externalDriverId },
      });
      if (existingByExt) {
        linked += 1;
        continue;
      }

      let driver = await tx.driver.findFirst({
        where: { tenantId, fullName },
      });
      if (!driver) {
        driver = await tx.driver.create({
          data: {
            tenantId,
            companyId: company.id,
            fullName,
            isActive: true,
            driverSharePct: 40,
            driverBonusSharePct: 50,
            driverPlatformFeeSharePct: 0,
            dailyFixedCents: BigInt(0),
          },
        });
        created += 1;
      }

      const existingForDriver = await tx.driverPlatformAccount.findFirst({
        where: { tenantId, driverId: driver.id, platform: RidePlatform.UBER },
      });
      if (existingForDriver) {
        await tx.driverPlatformAccount.update({
          where: { id: existingForDriver.id },
          data: {
            externalDriverId,
            isActive: true,
            metadata: {
              ...(typeof existingForDriver.metadata === "object" && existingForDriver.metadata
                ? (existingForDriver.metadata as Record<string, unknown>)
                : {}),
              source: "uber_import",
              uberLinkedAt: new Date().toISOString(),
            },
          },
        });
      } else {
        await tx.driverPlatformAccount.create({
          data: {
            tenantId,
            driverId: driver.id,
            platform: RidePlatform.UBER,
            externalDriverId,
            isActive: true,
            metadata: {
              source: "uber_import",
              uberLinkedAt: new Date().toISOString(),
            },
          },
        });
      }
      linked += 1;
    }
  });

  return { ok: true, created, linked, total: api.data.length, orgId: org.data };
}
