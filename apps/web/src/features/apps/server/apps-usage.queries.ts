/**
 * Apps usage KPIs for today by platform.
 *
 * Business definitions: docs/especificacion-datos/pantalla-2-apps.md
 */
import "server-only";

import {
  classifyProductivity,
  computeFleetDayAverages,
  statusFromProductivity,
} from "@/features/apps/lib/apps-productivity";
import { ridePlatformToSlug, sortPlatformSlugs } from "@/features/apps/lib/apps-platform";
import type {
  AppsMetricSource,
  AppsUsageRow,
  AppsUsageTodaySnapshot,
} from "@/features/apps/lib/apps-usage-types";
import type { CompanyScope } from "@/features/auth/server/company-scope";
import { driverWhere } from "@/features/auth/server/company-scope";
import {
  addTripToAgg,
  emptyTripMoneyAgg,
  formatEuroFromCents,
} from "@/features/billing/server/trip-metrics";
import {
  computeTurnoAbiertoByDriver,
  endOfLocalDay,
  startOfLocalDay,
} from "@/features/shifts/lib/shift-open-status";
import type { ProductivityThresholds } from "@fleethub/auth";
import { acceptanceFromOffers, estimateAcceptanceRate, parseDriverConnectionMetadata } from "@fleethub/auth";
import {
  formatAppsEurHora,
  resolveEurPerHourFromConnectedMinutes,
} from "@fleethub/auth/eur-per-hour";
import { resolveConnectionDot } from "@/features/drivers/lib/driver-connection-status";
import { withTenant } from "@/infrastructure/database";
import type { RidePlatform } from "@prisma/client";

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function formatHours(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(totalMinutes / 60);
  const min = totalMinutes % 60;
  return `${h}h ${min}min`;
}

function bucketGrossCents(agg: ReturnType<typeof emptyTripMoneyAgg>): bigint {
  if (agg.grossCents > BigInt(0)) return agg.grossCents;
  return agg.netCents;
}

function acceptanceEstimate(viajes: number): number {
  return estimateAcceptanceRate(viajes);
}

export async function listAppsUsageToday(
  tenantId: string,
  scope: CompanyScope,
  thresholds: ProductivityThresholds,
): Promise<AppsUsageTodaySnapshot> {
  const from = startOfTodayUtc();
  const todayLocalStart = startOfLocalDay(new Date());
  const todayLocalEnd = endOfLocalDay(new Date());

  const [trips, dayMetrics, pendingTrips, liquidationsToday, platformAccounts] =
    await Promise.all([
    withTenant(tenantId, (tx) =>
    tx.trip.findMany({
      where: {
        tenantId,
        startedAt: { gte: from },
        driver: driverWhere(scope),
      },
      select: {
        platform: true,
        startedAt: true,
        endedAt: true,
        grossAmountCents: true,
        platformFeeCents: true,
        netAmountCents: true,
        tipCents: true,
        tollCents: true,
        paymentMethod: true,
        driver: {
          select: {
            id: true,
            fullName: true,
            company: { select: { legalName: true } },
          },
        },
      },
    }),
    ),
    withTenant(tenantId, (tx) =>
      tx.driverPlatformDayMetric.findMany({
        where: {
          tenantId,
          day: { gte: from },
          driver: driverWhere(scope),
        },
        select: {
          driverId: true,
          platform: true,
          hoursOnlineMinutes: true,
          missedOffers: true,
          rejectedTrips: true,
        },
      }),
    ),
    withTenant(tenantId, (tx) =>
      tx.trip.findMany({
        where: {
          tenantId,
          liquidationStatus: "pending",
          driver: driverWhere(scope),
        },
        select: { driverId: true, startedAt: true },
      }),
    ),
    withTenant(tenantId, (tx) =>
      tx.shiftLiquidation.findMany({
        where: {
          tenantId,
          status: "active",
          closedAt: { gte: todayLocalStart, lte: todayLocalEnd },
          driver: driverWhere(scope),
        },
        select: { driverId: true, closedAt: true },
      }),
    ),
    withTenant(tenantId, (tx) =>
      tx.driverPlatformAccount.findMany({
        where: {
          tenantId,
          isActive: true,
          platform: { in: ["UBER", "FREENOW"] },
          driver: driverWhere(scope),
        },
        select: { driverId: true, platform: true, metadata: true },
      }),
    ),
  ]);

  const turnoAbiertoByDriver = computeTurnoAbiertoByDriver(
    pendingTrips,
    liquidationsToday,
  );

  const connectionByKey = new Map(
    platformAccounts.map((a) => [
      `${a.driverId}:${a.platform}`,
      parseDriverConnectionMetadata(a.metadata),
    ] as const),
  );

  const metricsByDriverPlatform = new Map(
    dayMetrics.map((m) => [`${m.driverId}:${m.platform}`, m] as const),
  );

  type Bucket = {
    driverId: string;
    conductor: string;
    empresa: string;
    platform: RidePlatform;
    agg: ReturnType<typeof emptyTripMoneyAgg>;
  };

  const buckets = new Map<string, Bucket>();

  for (const trip of trips) {
    const key = `${trip.driver.id}:${trip.platform}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        driverId: trip.driver.id,
        conductor: trip.driver.fullName,
        empresa: trip.driver.company.legalName,
        platform: trip.platform,
        agg: emptyTripMoneyAgg(),
      };
      buckets.set(key, bucket);
    }
    addTripToAgg(bucket.agg, trip);
  }

  const draftRows: AppsUsageRow[] = [];

  for (const bucket of buckets.values()) {
    const slug = ridePlatformToSlug(bucket.platform);
    const viajes = bucket.agg.count;
    const stored = metricsByDriverPlatform.get(`${bucket.driverId}:${bucket.platform}`);
    const tripHoursMs = bucket.agg.totalDurationMs;
    const storedHoursMs =
      stored != null && stored.hoursOnlineMinutes > 0
        ? stored.hoursOnlineMinutes * 60_000
        : 0;
    const hoursMs = Math.max(tripHoursMs, storedHoursMs);
    const horasSource: AppsMetricSource =
      storedHoursMs > 0 && storedHoursMs >= tripHoursMs * 0.9
        ? "platform"
        : tripHoursMs > 0
          ? "trips"
          : "estimated";
    const platformOffersKnown =
      stored != null && (stored.missedOffers > 0 || stored.rejectedTrips > 0);
    const grossCents = bucketGrossCents(bucket.agg);
    const connectedMinutes = Math.round(hoursMs / 60_000);
    const acc = platformOffersKnown
      ? (acceptanceFromOffers(viajes, stored!.missedOffers, stored!.rejectedTrips) ??
        acceptanceEstimate(viajes))
      : acceptanceEstimate(viajes);
    const aceptacionSource: AppsMetricSource = platformOffersKnown ? "platform" : "estimated";
    const horasDecimal = Math.round((hoursMs / 3_600_000) * 10) / 10;
    const facturacionEur = Number(grossCents) / 100;
    const eurPerHour = resolveEurPerHourFromConnectedMinutes(grossCents, connectedMinutes);

    const turnoAbierto = turnoAbiertoByDriver.get(bucket.driverId) ?? false;
    const connectionDot = resolveConnectionDot({
      viajesHoy: viajes,
      platform: bucket.platform,
      turnoAbierto,
      metadata: connectionByKey.get(`${bucket.driverId}:${bucket.platform}`) ?? {},
    });

    draftRows.push({
      platform: slug,
      conductor: bucket.conductor,
      empresa: bucket.empresa,
      viajes,
      facturacion: formatEuroFromCents(grossCents),
      horas: formatHours(hoursMs),
      eurH: formatAppsEurHora(grossCents, connectedMinutes),
      aceptacion:
        aceptacionSource === "platform" ? `${acc} %` : `${acc} % (est.)`,
      horasSource,
      aceptacionSource,
      facturacionEur,
      horasDecimal,
      eurPerHour,
      aceptacionPct: acc,
      productividad: "Bajo umbral",
      status: "low",
      connectionDot,
    });
  }

  const fleetDayAverages = computeFleetDayAverages(draftRows);

  for (const row of draftRows) {
    const prod = classifyProductivity(
      row.eurPerHour,
      row.aceptacionPct,
      thresholds,
      fleetDayAverages,
    );
    row.productividad = prod;
    row.status = statusFromProductivity(prod);
  }

  const byPlatform: Record<string, AppsUsageRow[]> = {};
  for (const row of draftRows) {
    const list = byPlatform[row.platform] ?? [];
    list.push(row);
    byPlatform[row.platform] = list;
  }

  const platformSlugs = sortPlatformSlugs(Object.keys(byPlatform));
  for (const slug of platformSlugs) {
    byPlatform[slug]!.sort((a, b) => a.conductor.localeCompare(b.conductor, "es"));
  }

  return { platformSlugs, byPlatform, fleetDayAverages };
}
