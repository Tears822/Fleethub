import "server-only";

import { listSectorBenchmarkOptInTenantIds } from "@fleethub/auth";
import type { AnalyticsMetrics } from "@/features/analytics/lib/analytics-kpi";
import type { SectorDriverAverages } from "@/features/analytics/lib/analytics-kpi";
import type { AnalyticsSectorByPlatform } from "@/features/analytics/lib/analytics-types";
import {
  addTripToAgg,
  emptyTripMoneyAgg,
  eurosFromCents,
  type TripMoneyAgg,
} from "@/features/billing/server/trip-metrics";
import { tenantDayEndFromCalendarDate, tenantDayStartFromCalendarDate } from "@fleethub/auth/display-timezone";
import { withoutTenant } from "@/infrastructure/database";
import type { RidePlatform } from "@prisma/client";

type TripRow = {
  tenantId: string;
  platform: RidePlatform;
  startedAt: Date;
  endedAt: Date | null;
  grossAmountCents: bigint | null;
  platformFeeCents: bigint | null;
  netAmountCents: bigint | null;
  tipCents: bigint | null;
  tollCents: bigint | null;
  paymentMethod: string | null;
  driverId: string;
};

function metricsFromAgg(agg: TripMoneyAgg): AnalyticsMetrics {
  const facturacion = eurosFromCents(agg.grossCents);
  const comisiones = -eurosFromCents(agg.feeCents);
  const neto = eurosFromCents(agg.netCents);
  const hours = Math.max(0.5, agg.totalDurationMs / 3_600_000);
  const eurHora = Math.round((facturacion / hours) * 100) / 100;
  return { facturacion, comisiones, eurHora, neto };
}

type SectorPlatformFilter = "all" | "uber" | "freenow" | "bolt" | "cabify";

function filterTripsByPlatform(trips: TripRow[], platform: SectorPlatformFilter): TripRow[] {
  if (platform === "all") return trips;
  const ride =
    platform === "uber"
      ? "UBER"
      : platform === "freenow"
        ? "FREENOW"
        : platform === "bolt"
          ? "BOLT"
          : "CABIFY";
  return trips.filter((t) => t.platform === ride);
}

function aggregateTrips(trips: TripRow[]): TripMoneyAgg {
  const agg = emptyTripMoneyAgg();
  for (const t of trips) addTripToAgg(agg, t);
  return agg;
}

function averageMetrics(list: AnalyticsMetrics[]): AnalyticsMetrics {
  if (list.length === 0) {
    return { facturacion: 0, comisiones: 0, eurHora: 0, neto: 0 };
  }
  const sum = list.reduce(
    (acc, m) => ({
      facturacion: acc.facturacion + m.facturacion,
      comisiones: acc.comisiones + m.comisiones,
      eurHora: acc.eurHora + m.eurHora,
      neto: acc.neto + m.neto,
    }),
    { facturacion: 0, comisiones: 0, eurHora: 0, neto: 0 },
  );
  const n = list.length;
  return {
    facturacion: Math.round((sum.facturacion / n) * 100) / 100,
    comisiones: Math.round((sum.comisiones / n) * 100) / 100,
    eurHora: Math.round((sum.eurHora / n) * 100) / 100,
    neto: Math.round((sum.neto / n) * 100) / 100,
  };
}

function tenantMetricsMap(
  trips: TripRow[],
  excludeTenantId: string,
  allowedTenantIds: Set<string>,
): Map<string, AnalyticsMetrics> {
  const byTenant = new Map<string, TripRow[]>();
  for (const t of trips) {
    if (t.tenantId === excludeTenantId) continue;
    if (!allowedTenantIds.has(t.tenantId)) continue;
    const list = byTenant.get(t.tenantId) ?? [];
    list.push(t);
    byTenant.set(t.tenantId, list);
  }
  const out = new Map<string, AnalyticsMetrics>();
  for (const [tid, list] of byTenant) {
    out.set(tid, metricsFromAgg(aggregateTrips(list)));
  }
  return out;
}

function sectorForPlatform(
  trips: TripRow[],
  excludeTenantId: string,
  allowedTenantIds: Set<string>,
  platform: SectorPlatformFilter,
): AnalyticsMetrics {
  const filtered = filterTripsByPlatform(trips, platform);
  const perTenant = [...tenantMetricsMap(filtered, excludeTenantId, allowedTenantIds).values()];
  return averageMetrics(perTenant);
}

const EMPTY_DRIVER_AVG: SectorDriverAverages = {
  facturacion: 0,
  comisiones: 0,
  viajes: 0,
  turnos: 0,
  mediaTurno: 0,
  eurHora: 0,
  propinas: 0,
  primas: 0,
};

function driverAveragesFromTrips(
  trips: TripRow[],
  excludeTenantId: string,
  allowedTenantIds: Set<string>,
  platform: SectorPlatformFilter,
): SectorDriverAverages {
  const scoped = filterTripsByPlatform(trips, platform);
  const byDriver = new Map<string, TripMoneyAgg>();
  for (const t of scoped) {
    if (t.tenantId === excludeTenantId) continue;
    if (!allowedTenantIds.has(t.tenantId)) continue;
    let agg = byDriver.get(t.driverId);
    if (!agg) {
      agg = emptyTripMoneyAgg();
      byDriver.set(t.driverId, agg);
    }
    addTripToAgg(agg, t);
  }
  if (byDriver.size === 0) {
    return { ...EMPTY_DRIVER_AVG };
  }
  let fact = 0;
  let com = 0;
  let viajes = 0;
  let turnos = 0;
  let media = 0;
  let eur = 0;
  let prop = 0;
  let prim = 0;
  for (const agg of byDriver.values()) {
    const m = metricsFromAgg(agg);
    fact += m.facturacion;
    com += m.comisiones;
    viajes += agg.count;
    turnos += agg.shiftDays.size;
    media += agg.shiftDays.size > 0 ? Math.round((m.facturacion / agg.shiftDays.size) * 100) / 100 : m.facturacion;
    eur += m.eurHora;
    prop += eurosFromCents(agg.tipCents);
    prim += eurosFromCents(agg.bonusCents);
  }
  const n = byDriver.size;
  return {
    facturacion: Math.round((fact / n) * 100) / 100,
    comisiones: Math.round((com / n) * 100) / 100,
    viajes: Math.round(viajes / n),
    turnos: Math.round(turnos / n),
    mediaTurno: Math.round((media / n) * 100) / 100,
    eurHora: Math.round((eur / n) * 100) / 100,
    propinas: Math.round((prop / n) * 100) / 100,
    primas: Math.round((prim / n) * 100) / 100,
  };
}

export function emptyAnalyticsSectorBenchmarks(): AnalyticsSectorByPlatform {
  const zero: AnalyticsMetrics = {
    facturacion: 0,
    comisiones: 0,
    eurHora: 0,
    neto: 0,
  };
  return {
    total: zero,
    uber: zero,
    freenow: zero,
    bolt: zero,
    cabify: zero,
    driverAverages: {
      total: { ...EMPTY_DRIVER_AVG },
      uber: { ...EMPTY_DRIVER_AVG },
      freenow: { ...EMPTY_DRIVER_AVG },
      bolt: { ...EMPTY_DRIVER_AVG },
      cabify: { ...EMPTY_DRIVER_AVG },
    },
  };
}

export async function getAnalyticsSectorBenchmarks(
  excludeTenantId: string,
  dateFrom: Date,
  dateTo: Date,
  options?: { viewerOptedIn?: boolean },
): Promise<AnalyticsSectorByPlatform> {
  if (options?.viewerOptedIn === false) {
    return emptyAnalyticsSectorBenchmarks();
  }

  const optedInIds = await listSectorBenchmarkOptInTenantIds();
  const allowedTenantIds = new Set(
    optedInIds.filter((id) => id !== excludeTenantId),
  );
  if (allowedTenantIds.size === 0) {
    return emptyAnalyticsSectorBenchmarks();
  }

  const rangeStart = tenantDayStartFromCalendarDate(dateFrom);
  const rangeEnd = tenantDayEndFromCalendarDate(dateTo);

  const trips = await withoutTenant((db) =>
    db.trip.findMany({
      where: {
        liquidationStatus: "closed",
        startedAt: { gte: rangeStart, lte: rangeEnd },
        tenantId: { in: [...allowedTenantIds] },
      },
      select: {
        tenantId: true,
        platform: true,
        startedAt: true,
        endedAt: true,
        grossAmountCents: true,
        platformFeeCents: true,
        netAmountCents: true,
        tipCents: true,
        platformBonusCents: true,
        tollCents: true,
        paymentMethod: true,
        driverId: true,
      },
    }),
  );

  return {
    total: sectorForPlatform(trips, excludeTenantId, allowedTenantIds, "all"),
    uber: sectorForPlatform(trips, excludeTenantId, allowedTenantIds, "uber"),
    freenow: sectorForPlatform(trips, excludeTenantId, allowedTenantIds, "freenow"),
    bolt: sectorForPlatform(trips, excludeTenantId, allowedTenantIds, "bolt"),
    cabify: sectorForPlatform(trips, excludeTenantId, allowedTenantIds, "cabify"),
    driverAverages: {
      total: driverAveragesFromTrips(trips, excludeTenantId, allowedTenantIds, "all"),
      uber: driverAveragesFromTrips(trips, excludeTenantId, allowedTenantIds, "uber"),
      freenow: driverAveragesFromTrips(trips, excludeTenantId, allowedTenantIds, "freenow"),
      bolt: driverAveragesFromTrips(trips, excludeTenantId, allowedTenantIds, "bolt"),
      cabify: driverAveragesFromTrips(trips, excludeTenantId, allowedTenantIds, "cabify"),
    },
  };
}
