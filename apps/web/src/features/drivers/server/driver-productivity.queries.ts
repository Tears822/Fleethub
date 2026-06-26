import "server-only";

import type { CompanyScope } from "@/features/auth/server/company-scope";
import { driverWhere } from "@/features/auth/server/company-scope";
import {
  estimateAcceptanceRate,
  productivityLevelFromMetrics,
  tripDurationMs,
  type ProductivityLevel,
} from "@fleethub/auth/driver-productivity";
import type { ProductivityThresholds } from "@fleethub/auth";
import { withTenant } from "@/infrastructure/database";

function startOfMonthUtc(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export type DriverProductivityMap = Record<string, ProductivityLevel>;

export async function loadDriverProductivityMap(
  tenantId: string,
  scope: CompanyScope,
  thresholds: ProductivityThresholds,
): Promise<DriverProductivityMap> {
  const from = startOfMonthUtc();

  const trips = await withTenant(tenantId, (tx) =>
    tx.trip.findMany({
      where: {
        tenantId,
        startedAt: { gte: from },
        driver: driverWhere(scope),
      },
      select: {
        driverId: true,
        startedAt: true,
        endedAt: true,
        netAmountCents: true,
      },
    }),
  );

  const byDriver = new Map<string, { net: bigint; ms: number; count: number }>();

  for (const t of trips) {
    const cur = byDriver.get(t.driverId) ?? { net: BigInt(0), ms: 0, count: 0 };
    cur.net += t.netAmountCents ?? BigInt(0);
    cur.ms += tripDurationMs(t.startedAt, t.endedAt);
    cur.count += 1;
    byDriver.set(t.driverId, cur);
  }

  const out: DriverProductivityMap = {};
  for (const [driverId, agg] of byDriver) {
    const hours = agg.ms / 3_600_000;
    const eurH = hours >= 0.25 ? Number(agg.net) / 100 / hours : 0;
    const tripsH = hours >= 0.25 ? agg.count / hours : 0;
    const acc = estimateAcceptanceRate(agg.count);
    out[driverId] = productivityLevelFromMetrics(eurH, tripsH, acc, thresholds);
  }

  return out;
}
