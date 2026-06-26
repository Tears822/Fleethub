import { computeDayMetricsFromTrips } from "@fleethub/auth";
import type { PrismaClient, RidePlatform } from "@prisma/client";

function utcDayOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

type TripRow = {
  driverId: string;
  platform: RidePlatform;
  startedAt: Date;
  endedAt: Date | null;
};

/** Demo KPIs de plataforma para sidebar «Actividad del turno» (FRD §6). */
export async function seedDriverPlatformDayMetrics(
  prisma: PrismaClient,
  tenantId: string,
): Promise<void> {
  const trips = await prisma.trip.findMany({
    where: { tenantId, liquidationStatus: "pending" },
    select: { driverId: true, platform: true, startedAt: true, endedAt: true },
  });

  const groups = new Map<string, TripRow[]>();
  for (const t of trips) {
    const day = utcDayOnly(t.startedAt).toISOString().slice(0, 10);
    const key = `${t.driverId}|${t.platform}|${day}`;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  for (const [key, list] of groups) {
    const [driverId, platform, dayStr] = key.split("|") as [string, RidePlatform, string];
    const { hoursOnlineMinutes, missedOffers, rejectedTrips } = computeDayMetricsFromTrips(
      list.map((trip) => ({
        startedAt: trip.startedAt,
        endedAt: trip.endedAt,
        grossAmountCents: null,
        netAmountCents: null,
      })),
    );

    await prisma.driverPlatformDayMetric.upsert({
      where: {
        tenantId_driverId_platform_day: {
          tenantId,
          driverId,
          platform,
          day: new Date(`${dayStr}T00:00:00.000Z`),
        },
      },
      create: {
        tenantId,
        driverId,
        platform,
        day: new Date(`${dayStr}T00:00:00.000Z`),
        hoursOnlineMinutes,
        missedOffers,
        rejectedTrips,
      },
      update: {
        hoursOnlineMinutes,
        missedOffers,
        rejectedTrips,
      },
    });
  }
}
