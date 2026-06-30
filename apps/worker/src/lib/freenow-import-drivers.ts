import { isLikelyFleetEntityDriverName } from "@fleethub/auth";
import { RidePlatform, withTenant } from "@fleethub/db";
import {
  freenowDriverDisplayName,
  freenowPublicDriverId,
  listAllFreenowCompanyDrivers,
} from "./freenow-client.js";
import { externalDriverIdTakenByOther } from "./platform-account-link-guard.js";

/** Import ACTIVE FreeNow drivers into FleetHub (creates drivers + platform accounts). */
export async function importFreenowDriversForTenant(
  tenantId: string,
  publicCompanyId: string,
  options?: { fleetCompanyId?: string },
): Promise<
  | { ok: true; created: number; linked: number; total: number }
  | { ok: false; message: string }
> {
  const api = await listAllFreenowCompanyDrivers(publicCompanyId, { status: "ACTIVE" });
  if (!api.ok) {
    return { ok: false, message: api.message };
  }

  let created = 0;
  let linked = 0;

  await withTenant(tenantId, async (tx) => {
    let companyId = options?.fleetCompanyId;
    if (!companyId) {
      const company = await tx.company.findFirst({
        where: { tenantId },
        orderBy: { createdAt: "asc" },
      });
      if (!company) {
        throw new Error("Tenant has no company row");
      }
      companyId = company.id;
    }

    const fleetCompanyNames = (
      await tx.company.findMany({
        where: { tenantId },
        select: { legalName: true },
      })
    ).map((c) => c.legalName);

    for (const row of api.drivers) {
      const externalDriverId = freenowPublicDriverId(row);
      const fullName = freenowDriverDisplayName(row);
      if (!externalDriverId || !fullName) continue;
      if (isLikelyFleetEntityDriverName(fullName, fleetCompanyNames)) continue;

      const existingByExt = await tx.driverPlatformAccount.findFirst({
        where: { tenantId, platform: RidePlatform.FREENOW, externalDriverId },
      });
      if (existingByExt) {
        linked += 1;
        continue;
      }

      let driver = await tx.driver.findFirst({
        where: { tenantId, fullName },
        select: { id: true, companyId: true },
      });
      if (!driver) {
        const createdDriver = await tx.driver.create({
          data: {
            tenantId,
            companyId,
            fullName,
            isActive: true,
            driverSharePct: 40,
            driverBonusSharePct: 50,
            driverPlatformFeeSharePct: 0,
            dailyFixedCents: BigInt(0),
          },
        });
        driver = { id: createdDriver.id, companyId };
        created += 1;
      } else if (driver.companyId !== companyId) {
        await tx.driver.update({
          where: { id: driver.id },
          data: { companyId },
        });
      }

      const existingForDriver = await tx.driverPlatformAccount.findFirst({
        where: { tenantId, driverId: driver.id, platform: RidePlatform.FREENOW },
      });
      if (existingForDriver) {
        if (
          await externalDriverIdTakenByOther(
            tx,
            tenantId,
            RidePlatform.FREENOW,
            externalDriverId,
            driver.id,
          )
        ) {
          linked += 1;
          continue;
        }
        await tx.driverPlatformAccount.update({
          where: { id: existingForDriver.id },
          data: {
            externalDriverId,
            isActive: true,
            metadata: {
              ...(typeof existingForDriver.metadata === "object" && existingForDriver.metadata
                ? (existingForDriver.metadata as Record<string, unknown>)
                : {}),
              source: "freenow_import",
              freenowPublicCompanyId: publicCompanyId,
              freenowLinkedAt: new Date().toISOString(),
            },
          },
        });
      } else {
        if (
          await externalDriverIdTakenByOther(
            tx,
            tenantId,
            RidePlatform.FREENOW,
            externalDriverId,
            driver.id,
          )
        ) {
          linked += 1;
          continue;
        }
        await tx.driverPlatformAccount.create({
          data: {
            tenantId,
            driverId: driver.id,
            platform: RidePlatform.FREENOW,
            externalDriverId,
            isActive: true,
            metadata: {
              source: "freenow_import",
              freenowPublicCompanyId: publicCompanyId,
              freenowLinkedAt: new Date().toISOString(),
            },
          },
        });
      }
      linked += 1;
    }
  });

  return { ok: true, created, linked, total: api.drivers.length };
}
