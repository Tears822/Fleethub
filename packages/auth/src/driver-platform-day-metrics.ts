import { RidePlatform, withTenant, withoutTenant } from "@fleethub/db";
import { computeDayMetricsFromTrips } from "./shift-activity";
import { driverWhere, type CompanyScope } from "./tenant-scope";

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function utcDayOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

type TripSlice = {
  driverId: string;
  platform: RidePlatform;
  startedAt: Date;
  endedAt: Date | null;
  grossAmountCents: bigint | null;
  netAmountCents: bigint | null;
};

/**
 * Rebuild today's `driver_platform_day_metrics` from trips in DB.
 * Preserves missed/rejected when already supplied by platform sync (FRD §6).
 */
export async function refreshTodayDriverPlatformMetrics(
  tenantId: string,
  scope: CompanyScope,
): Promise<{ buckets: number }> {
  const from = startOfTodayUtc();
  const today = utcDayOnly(new Date());

  const trips = await withTenant(tenantId, (tx) =>
    tx.trip.findMany({
      where: {
        tenantId,
        startedAt: { gte: from },
        driver: driverWhere(scope),
      },
      select: {
        driverId: true,
        platform: true,
        startedAt: true,
        endedAt: true,
        grossAmountCents: true,
        netAmountCents: true,
      },
    }),
  );

  const byKey = new Map<string, TripSlice[]>();
  for (const t of trips) {
    const key = `${t.driverId}\0${t.platform}`;
    const list = byKey.get(key) ?? [];
    list.push(t);
    byKey.set(key, list);
  }

  let buckets = 0;

  await withTenant(tenantId, async (tx) => {
    for (const [key, dayTrips] of byKey) {
      const sep = key.indexOf("\0");
      const driverId = key.slice(0, sep);
      const platform = key.slice(sep + 1) as RidePlatform;
      const computed = computeDayMetricsFromTrips(dayTrips);

      const existing = await tx.driverPlatformDayMetric.findUnique({
        where: {
          tenantId_driverId_platform_day: {
            tenantId,
            driverId,
            platform,
            day: today,
          },
        },
      });

      const platformOffersKnown =
        existing != null && (existing.missedOffers > 0 || existing.rejectedTrips > 0);

      await tx.driverPlatformDayMetric.upsert({
        where: {
          tenantId_driverId_platform_day: {
            tenantId,
            driverId,
            platform,
            day: today,
          },
        },
        create: {
          tenantId,
          driverId,
          platform,
          day: today,
          hoursOnlineMinutes: computed.hoursOnlineMinutes,
          missedOffers: computed.missedOffers,
          rejectedTrips: computed.rejectedTrips,
        },
        update: {
          hoursOnlineMinutes: Math.max(
            existing?.hoursOnlineMinutes ?? 0,
            computed.hoursOnlineMinutes,
          ),
          missedOffers: platformOffersKnown ? existing!.missedOffers : computed.missedOffers,
          rejectedTrips: platformOffersKnown
            ? existing!.rejectedTrips
            : computed.rejectedTrips,
        },
      });
      buckets += 1;
    }
  });

  return { buckets };
}

/** Refresh today metrics for tenants with recent ingestion activity. */
export async function refreshTodayMetricsForRecentlyActiveTenants(
  windowMs = 60 * 60 * 1000,
): Promise<{ tenants: number; buckets: number }> {
  const since = new Date(Date.now() - windowMs);
  const rows = await withoutTenant((tx) =>
    tx.ingestionEvent.findMany({
      where: { receivedAt: { gte: since } },
      distinct: ["tenantId"],
      select: { tenantId: true },
    }),
  );

  let buckets = 0;
  for (const { tenantId } of rows) {
    const result = await refreshTodayDriverPlatformMetrics(tenantId, { mode: "all" });
    buckets += result.buckets;
  }

  return { tenants: rows.length, buckets };
}
