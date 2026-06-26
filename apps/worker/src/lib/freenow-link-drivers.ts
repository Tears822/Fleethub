import { RidePlatform, withTenant } from "@fleethub/db";
import {
  freenowDriverDisplayName,
  freenowPublicDriverId,
  listAllFreenowCompanyDrivers,
} from "./freenow-client.js";

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyFreenowPublicDriverId(id: string): boolean {
  return id.length >= 12 && /^[A-Z0-9]+$/i.test(id);
}

export function isFreenowPublicDriverId(id: string): boolean {
  return isLikelyFreenowPublicDriverId(id);
}

function firstLastKey(name: string): string | null {
  const parts = normalizeName(name).split(" ").filter(Boolean);
  if (parts.length < 2) return null;
  return `${parts[0]}|${parts[parts.length - 1]}`;
}

function shouldUpdateFreenowExternalId(current: string, fnId: string): boolean {
  const ext = current.trim();
  if (!ext || ext.startsWith("seed-") || ext.startsWith("manual-")) return true;
  if (!isLikelyFreenowPublicDriverId(ext) && isLikelyFreenowPublicDriverId(fnId)) return true;
  return false;
}

export async function linkFreenowDriversForTenant(
  tenantId: string,
  publicCompanyId: string,
  options?: { fleetCompanyId?: string },
): Promise<{ linked: number; freenowDrivers: number; message?: string }> {
  const drivers = await listAllFreenowCompanyDrivers(publicCompanyId, { status: "ACTIVE" });
  if (!drivers.ok) {
    return { linked: 0, freenowDrivers: 0, message: drivers.message };
  }

  const byName = new Map<string, string>();
  const byFirstLast = new Map<string, string>();
  for (const row of drivers.drivers) {
    const extId = freenowPublicDriverId(row);
    const name = freenowDriverDisplayName(row);
    if (!extId || !name) continue;
    byName.set(normalizeName(name), extId);
    const fl = firstLastKey(name);
    if (fl && !byFirstLast.has(fl)) byFirstLast.set(fl, extId);
  }

  let linked = 0;

  await withTenant(tenantId, async (tx) => {
    const fleetDrivers = await tx.driver.findMany({
      where: {
        tenantId,
        isActive: true,
        ...(options?.fleetCompanyId ? { companyId: options.fleetCompanyId } : {}),
      },
      select: { id: true, fullName: true },
    });

    for (const driver of fleetDrivers) {
      const fnId =
        byName.get(normalizeName(driver.fullName)) ??
        (firstLastKey(driver.fullName)
          ? byFirstLast.get(firstLastKey(driver.fullName)!)
          : undefined);
      if (!fnId) continue;

      const existing = await tx.driverPlatformAccount.findFirst({
        where: { tenantId, driverId: driver.id, platform: RidePlatform.FREENOW },
      });

      const ext = existing?.externalDriverId?.trim() ?? "";
      if (!shouldUpdateFreenowExternalId(ext, fnId)) {
        continue;
      }

      if (existing) {
        await tx.driverPlatformAccount.update({
          where: { id: existing.id },
          data: {
            externalDriverId: fnId,
            isActive: true,
            metadata: {
              ...(typeof existing.metadata === "object" && existing.metadata
                ? (existing.metadata as Record<string, unknown>)
                : {}),
              freenowLinkedAt: new Date().toISOString(),
              freenowPublicCompanyId: publicCompanyId,
            },
          },
        });
      } else {
        await tx.driverPlatformAccount.create({
          data: {
            tenantId,
            driverId: driver.id,
            platform: RidePlatform.FREENOW,
            externalDriverId: fnId,
            isActive: true,
            metadata: {
              freenowLinkedAt: new Date().toISOString(),
              freenowPublicCompanyId: publicCompanyId,
            },
          },
        });
      }
      linked += 1;
    }
  });

  return { linked, freenowDrivers: drivers.drivers.length };
}
