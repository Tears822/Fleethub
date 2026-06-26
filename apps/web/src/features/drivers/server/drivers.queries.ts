import "server-only";

import type { CompanyScope } from "@/features/auth/server/company-scope";
import { tenantDriverWhere } from "@/features/auth/server/company-scope";
import { withTenant } from "@/infrastructure/database";

export async function listDriversForTenant(tenantId: string, scope: CompanyScope) {
  return withTenant(tenantId, (tx) =>
    tx.driver.findMany({
      where: tenantDriverWhere(tenantId, scope),
      orderBy: { fullName: "asc" },
      include: {
        company: { select: { legalName: true } },
        driverPlatformAccounts: {
          where: { isActive: true },
          select: { platform: true, externalDriverId: true },
        },
      },
    }),
  );
}

export async function getDriverById(
  tenantId: string,
  driverId: string,
  scope: CompanyScope,
) {
  return withTenant(tenantId, (tx) =>
    tx.driver.findFirst({
      where: { id: driverId, ...tenantDriverWhere(tenantId, scope) },
      include: {
        company: true,
        driverPlatformAccounts: {
          where: { isActive: true },
          select: { platform: true, externalDriverId: true },
        },
      },
    }),
  );
}
