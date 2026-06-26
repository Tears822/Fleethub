import type { Prisma } from "@prisma/client";
import { RidePlatform, withTenant } from "@fleethub/db";
import {
  parseConnectedMinutesLabel,
} from "./eur-per-hour";
export {
  formatAppsEurHora,
  parseConnectedMinutesLabel as parseShiftHorasConectadoMinutes,
  resolveEurPerHourFromConnectedMinutes,
} from "./eur-per-hour";
import {
  tenantCalendarDayKey,
  tenantDayDateFromInstant,
  tenantDayDateFromKey,
  tenantDayEndFromIso,
  tenantDayStartFromIso,
} from "./display-timezone";

export type { ShiftActivityDto } from "./shift-activity-types";
import type { ShiftActivityDto } from "./shift-activity-types";
import { computeDayMetricsFromTripSlices } from "./day-metrics";

type TripSlice = {
  startedAt: Date;
  endedAt: Date | null;
  grossAmountCents: bigint | null;
  netAmountCents: bigint | null;
};

function tenantDayKeyFromInstant(d: Date): string {
  return tenantCalendarDayKey(d);
}

function tenantDayDate(d: Date): Date {
  return tenantDayDateFromInstant(d);
}

function formatHoursMinutes(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h}h ${min}min`;
}

/**
 * €/hora when connected time is ≥60 min; otherwise total gross (no hourly extrapolation).
 */
export function formatShiftEurHora(
  grossCents: number | bigint,
  connectedMinutes: number,
): string {
  const grossEuros = Number(grossCents) / 100;
  const fmt = (value: number) =>
    value.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const minutes = Math.max(0, Math.round(connectedMinutes));
  if (minutes < 60) {
    return `${fmt(grossEuros)} €`;
  }
  const hours = minutes / 60;
  const eurPerHour = hours > 0 ? grossEuros / hours : 0;
  return `${fmt(eurPerHour)} €`;
}

/** Display €/hora from gross + formatted connected-time label (sidebar / exports). */
export function resolveShiftEurHoraDisplay(
  grossCents: number | bigint,
  horasConectado: string,
): string {
  return formatShiftEurHora(grossCents, parseConnectedMinutesLabel(horasConectado));
}

/** Day KPIs from trip windows (hours); missed/rejected stay 0 unless platform supplies them. */
export function computeDayMetricsFromTrips(trips: TripSlice[]): {
  hoursOnlineMinutes: number;
  missedOffers: number;
  rejectedTrips: number;
} {
  const { hoursOnline, missed, rejections } = computeDayMetricsFromTripSlices(trips);
  return {
    hoursOnlineMinutes: Math.max(0, Math.round(hoursOnline * 60)),
    missedOffers: missed,
    rejectedTrips: rejections,
  };
}

async function backfillDriverPlatformDayMetricsFromTripsTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  driverId: string,
  platform: RidePlatform,
  trips: TripSlice[],
  options?: { onlyIfMissing?: boolean },
): Promise<void> {
  if (trips.length === 0) return;

  const byDay = new Map<string, TripSlice[]>();
  for (const t of trips) {
    const dayKey = tenantDayKeyFromInstant(t.startedAt);
    const list = byDay.get(dayKey) ?? [];
    list.push(t);
    byDay.set(dayKey, list);
  }

  for (const [dayStr, dayTrips] of byDay) {
    const day = tenantDayDateFromKey(dayStr);
    if (options?.onlyIfMissing) {
      const existing = await tx.driverPlatformDayMetric.findUnique({
        where: {
          tenantId_driverId_platform_day: {
            tenantId,
            driverId,
            platform,
            day,
          },
        },
      });
      if (existing) continue;
    }
    const metrics = computeDayMetricsFromTrips(dayTrips);
    await tx.driverPlatformDayMetric.upsert({
      where: {
        tenantId_driverId_platform_day: {
          tenantId,
          driverId,
          platform,
          day,
        },
      },
      create: {
        tenantId,
        driverId,
        platform,
        day,
        hoursOnlineMinutes: metrics.hoursOnlineMinutes,
        missedOffers: metrics.missedOffers,
        rejectedTrips: metrics.rejectedTrips,
      },
      update: {
        hoursOnlineMinutes: metrics.hoursOnlineMinutes,
        missedOffers: metrics.missedOffers,
        rejectedTrips: metrics.rejectedTrips,
      },
    });
  }
}

export async function backfillDriverPlatformDayMetricsFromTrips(
  tenantId: string,
  driverId: string,
  platform: RidePlatform,
  trips: TripSlice[],
  options?: { onlyIfMissing?: boolean },
): Promise<void> {
  await withTenant(tenantId, (tx) =>
    backfillDriverPlatformDayMetricsFromTripsTx(
      tx,
      tenantId,
      driverId,
      platform,
      trips,
      options,
    ),
  );
}

function tripSliceGrossCents(trips: TripSlice[]): bigint {
  let gross = BigInt(0);
  for (const t of trips) {
    const g = t.grossAmountCents ?? t.netAmountCents ?? BigInt(0);
    gross += g > BigInt(0) ? g : (t.netAmountCents ?? BigInt(0));
  }
  return gross;
}

function tripSliceConnectedMinutes(trips: TripSlice[]): number {
  const { hoursOnline } = computeDayMetricsFromTripSlices(trips);
  return Math.max(0, Math.round(hoursOnline * 60));
}

/**
 * Same rule as Apps: prefer platform-synced hours when the batch covers the full pending day.
 * Partial franja closes keep trip-window hours only (avoid inflating with whole-day platform KPIs).
 */
export function mergeShiftConnectedMinutes(
  tripMinutes: number,
  platformMinutes: number,
  usePlatformHours: boolean,
): number {
  if (!usePlatformHours || platformMinutes <= 0) return tripMinutes;
  if (tripMinutes <= 0) return platformMinutes;
  return Math.max(tripMinutes, platformMinutes);
}

function activityFromTripsEstimate(trips: TripSlice[]): ShiftActivityDto {
  const gross = tripSliceGrossCents(trips);
  const activeMinutes = tripSliceConnectedMinutes(trips);
  return {
    viajesRealizados: trips.length,
    horasConectado: formatHoursMinutes(activeMinutes),
    eurHora: formatShiftEurHora(gross, activeMinutes),
    noAtendidos: 0,
    rechazados: 0,
    source: "estimated",
  };
}

/** Merge trip-window hours with missed/rejected from synced platform day metrics. */
async function activityFromTripsWithPlatformOffers(
  tenantId: string,
  driverId: string,
  platform: RidePlatform,
  trips: TripSlice[],
): Promise<ShiftActivityDto> {
  const byDay = new Map<string, TripSlice[]>();
  for (const t of trips) {
    const dayKey = tenantDayKeyFromInstant(t.startedAt);
    const list = byDay.get(dayKey) ?? [];
    list.push(t);
    byDay.set(dayKey, list);
  }

  const dayKeys = [...byDay.keys()];
  const dayDates = dayKeys.map((d) => tenantDayDateFromKey(d));

  return withTenant(tenantId, async (tx) => {
    const rows = await tx.driverPlatformDayMetric.findMany({
      where: {
        tenantId,
        driverId,
        platform,
        day: { in: dayDates },
      },
    });

    const platformByDay = new Map<string, { hours: number; missed: number; rejected: number }>();
    for (const row of rows) {
      const key = tenantCalendarDayKey(row.day);
      const existing = platformByDay.get(key) ?? { hours: 0, missed: 0, rejected: 0 };
      existing.hours += row.hoursOnlineMinutes;
      existing.missed += row.missedOffers;
      existing.rejected += row.rejectedTrips;
      platformByDay.set(key, existing);
    }

    const sortedDayKeys = [...dayKeys].sort();
    const pendingCountByDay = new Map<string, number>();
    if (sortedDayKeys.length > 0) {
      const firstDayKey = sortedDayKeys[0]!;
      const lastDayKey = sortedDayKeys[sortedDayKeys.length - 1]!;
      const rangeStart = tenantDayStartFromIso(firstDayKey);
      const rangeEnd = tenantDayEndFromIso(lastDayKey);
      const pendingInRange = await tx.trip.findMany({
        where: {
          tenantId,
          driverId,
          platform,
          liquidationStatus: "pending",
          startedAt: { gte: rangeStart, lte: rangeEnd },
        },
        select: { startedAt: true },
      });
      for (const row of pendingInRange) {
        const key = tenantDayKeyFromInstant(row.startedAt);
        pendingCountByDay.set(key, (pendingCountByDay.get(key) ?? 0) + 1);
      }
    }

    let connectedMinutes = 0;
    let missed = 0;
    let rejected = 0;
    let usedPlatformHours = false;

    for (const dayKey of dayKeys) {
      const dayTrips = byDay.get(dayKey) ?? [];
      const tripMinutes = tripSliceConnectedMinutes(dayTrips);
      const platformDay = platformByDay.get(dayKey);
      const platformMinutes = platformDay?.hours ?? 0;
      missed += platformDay?.missed ?? 0;
      rejected += platformDay?.rejected ?? 0;

      const pendingOnDay = pendingCountByDay.get(dayKey) ?? 0;

      const fullPendingDay = pendingOnDay > 0 && dayTrips.length >= pendingOnDay;
      const dayMinutes = mergeShiftConnectedMinutes(
        tripMinutes,
        platformMinutes,
        fullPendingDay,
      );
      if (fullPendingDay && platformMinutes > 0 && dayMinutes >= platformMinutes) {
        usedPlatformHours = true;
      }
      connectedMinutes += dayMinutes;
    }

    const gross = tripSliceGrossCents(trips);
    const hasPlatformOffers = missed > 0 || rejected > 0;

    return {
      viajesRealizados: trips.length,
      horasConectado: formatHoursMinutes(connectedMinutes),
      eurHora: formatShiftEurHora(gross, connectedMinutes),
      noAtendidos: missed,
      rechazados: rejected,
      source: usedPlatformHours || hasPlatformOffers ? "platform" : "estimated",
    };
  });
}

export async function resolveShiftActivity(
  tenantId: string,
  driverId: string,
  platform: RidePlatform,
  trips: TripSlice[],
  options?: { forceTripEstimate?: boolean },
): Promise<ShiftActivityDto> {
  if (trips.length === 0) {
    return {
      viajesRealizados: 0,
      horasConectado: "0h 0min",
      eurHora: "0,00 €",
      noAtendidos: 0,
      rechazados: 0,
      source: "estimated",
    };
  }

  if (options?.forceTripEstimate) {
    return activityFromTripsWithPlatformOffers(tenantId, driverId, platform, trips);
  }

  const days = [...new Set(trips.map((t) => tenantDayKeyFromInstant(t.startedAt)))];
  const dayDates = days.map((d) => tenantDayDateFromKey(d));

  return withTenant(tenantId, async (tx) => {
    let rows = await tx.driverPlatformDayMetric.findMany({
      where: {
        tenantId,
        driverId,
        platform,
        day: { in: dayDates },
      },
    });

    if (rows.length === 0) {
      await backfillDriverPlatformDayMetricsFromTripsTx(
        tx,
        tenantId,
        driverId,
        platform,
        trips,
      );
      rows = await tx.driverPlatformDayMetric.findMany({
        where: {
          tenantId,
          driverId,
          platform,
          day: { in: dayDates },
        },
      });
    }

    if (rows.length === 0) {
      return activityFromTripsEstimate(trips);
    }

    let hoursMinutes = 0;
    let missed = 0;
    let rejected = 0;
    for (const row of rows) {
      hoursMinutes += row.hoursOnlineMinutes;
      missed += row.missedOffers;
      rejected += row.rejectedTrips;
    }

    let gross = BigInt(0);
    for (const t of trips) {
      const g = t.grossAmountCents ?? t.netAmountCents ?? BigInt(0);
      gross += g > BigInt(0) ? g : (t.netAmountCents ?? BigInt(0));
    }
    return {
      viajesRealizados: trips.length,
      horasConectado: formatHoursMinutes(hoursMinutes),
      eurHora: formatShiftEurHora(gross, hoursMinutes),
      noAtendidos: missed,
      rechazados: rejected,
      source: "platform" as const,
    };
  });
}

export async function upsertDriverPlatformDayMetric(input: {
  tenantId: string;
  driverId: string;
  platform: RidePlatform;
  day: Date;
  hoursOnlineMinutes: number;
  missedOffers: number;
  rejectedTrips: number;
}): Promise<void> {
  const day = tenantDayDate(input.day);
  await withTenant(input.tenantId, (tx) =>
    tx.driverPlatformDayMetric.upsert({
      where: {
        tenantId_driverId_platform_day: {
          tenantId: input.tenantId,
          driverId: input.driverId,
          platform: input.platform,
          day,
        },
      },
      create: {
        tenantId: input.tenantId,
        driverId: input.driverId,
        platform: input.platform,
        day,
        hoursOnlineMinutes: input.hoursOnlineMinutes,
        missedOffers: input.missedOffers,
        rejectedTrips: input.rejectedTrips,
      },
      update: {
        hoursOnlineMinutes: input.hoursOnlineMinutes,
        missedOffers: input.missedOffers,
        rejectedTrips: input.rejectedTrips,
      },
    }),
  );
}
