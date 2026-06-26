import { RidePlatform, withTenant } from "@fleethub/db";
import {
  listAllUberDrivers,
  resolveUberOrgId,
  uberDriverDisplayName,
  uberDriverExternalId,
} from "./uber-fleet-client.js";
import { resolveTenantUberOrgId } from "./tenant-platform-config.js";

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

/**
 * Match FleetHub drivers to Uber driver UUIDs by full name (best-effort).
 * Updates driver_platform_accounts.external_driver_id for UBER.
 */
export async function linkUberDriversForTenant(tenantId: string): Promise<{
  linked: number;
  uberDrivers: number;
  message?: string;
}> {
  const orgOverride = await resolveTenantUberOrgId(tenantId);
  const org = await resolveUberOrgId(orgOverride);
  if (!org.ok) {
    return { linked: 0, uberDrivers: 0, message: org.message };
  }

  const uberDrivers = await listAllUberDrivers(org.data);
  if (!uberDrivers.ok) {
    return { linked: 0, uberDrivers: 0, message: uberDrivers.message };
  }

  const byName = new Map<string, string>();
  const byFirstLast = new Map<string, string>();
  for (const row of uberDrivers.data) {
    const extId = uberDriverExternalId(row);
    const name = uberDriverDisplayName(row);
    if (!extId || !name) continue;
    byName.set(normalizeName(name), extId);
    const fl = firstLastKey(name);
    if (fl && !byFirstLast.has(fl)) byFirstLast.set(fl, extId);
  }

  let linked = 0;

  await withTenant(tenantId, async (tx) => {
    const drivers = await tx.driver.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, fullName: true },
    });

    for (const driver of drivers) {
      const uberId =
        byName.get(normalizeName(driver.fullName)) ??
        (firstLastKey(driver.fullName)
          ? byFirstLast.get(firstLastKey(driver.fullName)!)
          : undefined);
      if (!uberId) continue;

      const existing = await tx.driverPlatformAccount.findFirst({
        where: { tenantId, driverId: driver.id, platform: RidePlatform.UBER },
      });

      if (existing) {
        if (existing.externalDriverId.toLowerCase() === uberId.toLowerCase() && existing.isActive) {
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
            },
          },
        });
      } else {
        const existingByExt = await tx.driverPlatformAccount.findFirst({
          where: {
            tenantId,
            platform: RidePlatform.UBER,
            externalDriverId: { equals: uberId, mode: "insensitive" },
          },
        });
        if (existingByExt) continue;

        await tx.driverPlatformAccount.create({
          data: {
            tenantId,
            driverId: driver.id,
            platform: RidePlatform.UBER,
            externalDriverId: uberId,
            metadata: {
              uberLinkedAt: new Date().toISOString(),
              uberDisplayName: driver.fullName,
            },
          },
        });
      }
      linked += 1;
    }
  });

  return { linked, uberDrivers: uberDrivers.data.length };
}
