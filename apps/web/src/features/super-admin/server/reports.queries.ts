import "server-only";

import { commercialStatusLabel } from "@fleethub/auth";
import type { TenantCommercialStatus } from "@fleethub/db";
import { withoutTenant } from "@/infrastructure/database";

export type ActiveDriversMonthRow = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  companyNames: string[];
  commercialStatus: TenantCommercialStatus;
  commercialStatusLabel: string;
  activeDrivers: number;
  activeDriversUber: number;
  activeDriversFreeNow: number;
  closedTrips: number;
  closedTripsUber: number;
  closedTripsFreeNow: number;
};

function monthMetricsFromTrips(
  trips: { driverId: string; platform: "UBER" | "FREENOW" | "BOLT" | "CABIFY" }[],
) {
  const allDrivers = new Set<string>();
  const uberDrivers = new Set<string>();
  const freeNowDrivers = new Set<string>();
  let closedTripsUber = 0;
  let closedTripsFreeNow = 0;

  for (const trip of trips) {
    allDrivers.add(trip.driverId);
    if (trip.platform === "UBER") {
      uberDrivers.add(trip.driverId);
      closedTripsUber += 1;
    } else if (trip.platform === "FREENOW") {
      freeNowDrivers.add(trip.driverId);
      closedTripsFreeNow += 1;
    }
  }

  return {
    activeDrivers: allDrivers.size,
    activeDriversUber: uberDrivers.size,
    activeDriversFreeNow: freeNowDrivers.size,
    closedTrips: trips.length,
    closedTripsUber,
    closedTripsFreeNow,
  };
}

/** FRD §12 — conductores con al menos un viaje cerrado en el rango (todos los tenants). */
export async function listActiveDriversByDateRange(
  dateFrom: Date,
  dateTo: Date,
): Promise<ActiveDriversMonthRow[]> {
  const rangeEnd = new Date(dateTo);
  rangeEnd.setHours(23, 59, 59, 999);

  const tenants = await withoutTenant((db) =>
    db.tenant.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        commercialStatus: true,
        companies: { select: { legalName: true } },
        trips: {
          where: {
            liquidationStatus: "closed",
            startedAt: { gte: dateFrom, lte: rangeEnd },
          },
          select: { driverId: true, platform: true },
        },
      },
    }),
  );

  return tenants.map((t) => {
    const metrics = monthMetricsFromTrips(t.trips);
    return {
      tenantId: t.id,
      tenantName: t.name,
      tenantSlug: t.slug,
      companyNames: t.companies.map((c) => c.legalName),
      commercialStatus: t.commercialStatus,
      commercialStatusLabel: commercialStatusLabel(t.commercialStatus),
      ...metrics,
    };
  });
}

/** Atajo por mes calendario (compatibilidad con `?year=&month=`). */
export async function listActiveDriversByMonth(
  year: number,
  month: number,
): Promise<ActiveDriversMonthRow[]> {
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 0);
  return listActiveDriversByDateRange(from, to);
}

export type GlobalSyncErrorRow = {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  platform: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  errorMessage: string | null;
};

export type GlobalSyncErrorSummary = {
  failedLast7Days: number;
  failedLast24h: number;
  byPlatform: { platform: string; count: number }[];
};

/** FRD §12 — errores de sync agregados (últimos 7 días). */
export async function listGlobalSyncErrors(limit = 50): Promise<{
  rows: GlobalSyncErrorRow[];
  summary: GlobalSyncErrorSummary;
}> {
  const since7d = new Date();
  since7d.setDate(since7d.getDate() - 7);
  const since24h = new Date();
  since24h.setHours(since24h.getHours() - 24);

  const [rows, failedLast7Days, failedLast24h, byPlatformRaw] = await withoutTenant((db) =>
    Promise.all([
      db.syncRun.findMany({
        where: {
          status: { in: ["failed", "FAILED"] },
          startedAt: { gte: since7d },
        },
        orderBy: { startedAt: "desc" },
        take: limit,
        include: { tenant: { select: { name: true, slug: true } } },
      }),
      db.syncRun.count({
        where: {
          status: { in: ["failed", "FAILED"] },
          startedAt: { gte: since7d },
        },
      }),
      db.syncRun.count({
        where: {
          status: { in: ["failed", "FAILED"] },
          startedAt: { gte: since24h },
        },
      }),
      db.syncRun.groupBy({
        by: ["platform"],
        where: {
          status: { in: ["failed", "FAILED"] },
          startedAt: { gte: since7d },
        },
        _count: { _all: true },
      }),
    ]),
  );

  return {
    rows: rows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      tenantName: r.tenant.name,
      tenantSlug: r.tenant.slug,
      platform: r.platform,
      status: r.status,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      errorMessage: r.errorMessage,
    })),
    summary: {
      failedLast7Days,
      failedLast24h,
      byPlatform: byPlatformRaw.map((p) => ({
        platform: p.platform,
        count: p._count._all,
      })),
    },
  };
}
