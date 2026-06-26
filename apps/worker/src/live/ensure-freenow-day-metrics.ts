import { RidePlatform, withTenant } from "@fleethub/db";
import { upsertDriverPlatformDayMetric } from "@fleethub/auth/shift-activity";
import { listFreenowCompanyBookings } from "../lib/freenow-bookings.js";
import { computeFreenowDayMetrics } from "../lib/freenow-day-metrics.js";
import { resolveFreenowPublicCompanyIdForDriver } from "../lib/freenow-company-map.js";

function utcDayOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Fetch FreeNow bookings for shift days and upsert missed/rejected into day metrics.
 * Used when opening shift detail for closed shifts without platform offer counts.
 */
export async function ensureFreenowDriverDayMetricsForTripDays(params: {
  tenantId: string;
  driverId: string;
  tripStartedAts: Date[];
  /** Cap API backfill days (most recent first) for interactive detail loads. */
  maxDays?: number;
}): Promise<{ refreshedDays: number }> {
  if (params.tripStartedAts.length === 0) return { refreshedDays: 0 };

  const dpa = await withTenant(params.tenantId, (tx) =>
    tx.driverPlatformAccount.findFirst({
      where: {
        tenantId: params.tenantId,
        driverId: params.driverId,
        platform: RidePlatform.FREENOW,
        isActive: true,
      },
      select: { externalDriverId: true, metadata: true },
    }),
  );

  const publicDriverId = dpa?.externalDriverId?.trim() ?? "";
  if (
    !publicDriverId ||
    publicDriverId.startsWith("seed-") ||
    publicDriverId.startsWith("manual-")
  ) {
    return { refreshedDays: 0 };
  }

  const companyId = await resolveFreenowPublicCompanyIdForDriver(
    params.tenantId,
    params.driverId,
    dpa?.metadata,
  );

  let uniqueDays = [
    ...new Set(params.tripStartedAts.map((d) => utcDayOnly(d).getTime())),
  ]
    .map((ms) => new Date(ms))
    .sort((a, b) => b.getTime() - a.getTime());

  if (params.maxDays != null && params.maxDays > 0 && uniqueDays.length > params.maxDays) {
    uniqueDays = uniqueDays.slice(0, params.maxDays);
  }

  let refreshedDays = 0;

  for (const day of uniqueDays) {
    const existing = await withTenant(params.tenantId, (tx) =>
      tx.driverPlatformDayMetric.findUnique({
        where: {
          tenantId_driverId_platform_day: {
            tenantId: params.tenantId,
            driverId: params.driverId,
            platform: RidePlatform.FREENOW,
            day,
          },
        },
      }),
    );

    const needsOffers =
      !existing || existing.missedOffers === 0 && existing.rejectedTrips === 0;
    if (!needsOffers) continue;

    const dayEnd = new Date(day.getTime() + 24 * 60 * 60 * 1000);
    const bookings = await listFreenowCompanyBookings({
      publicCompanyId: companyId,
      from: day,
      to: dayEnd,
    });
    if (!bookings.ok) continue;

    const metrics = computeFreenowDayMetrics(bookings.bookings, publicDriverId, day);
    const hoursMinutes = Math.max(
      existing?.hoursOnlineMinutes ?? 0,
      Math.round(metrics.hoursOnline * 60),
    );

    await upsertDriverPlatformDayMetric({
      tenantId: params.tenantId,
      driverId: params.driverId,
      platform: RidePlatform.FREENOW,
      day,
      hoursOnlineMinutes: hoursMinutes,
      missedOffers: metrics.missed,
      rejectedTrips: metrics.rejections,
    });
    refreshedDays += 1;
  }

  return { refreshedDays };
}
