import type { Prisma } from "@prisma/client";
import { prisma, RidePlatform, withTenant } from "@fleethub/db";
import {
  estimateAcceptanceRate,
  productivityLevelFromMetrics,
  tripDurationMs,
} from "./driver-productivity";
import { getTenantIntegrationSettings } from "./tenant-general-settings";
import { getTenantProductivityThresholds } from "./tenant-settings";
import {
  isSyncReferenceStale,
  syncPlatformLabel,
  syncStaleThresholdMs,
  type SyncPlatform,
} from "./sync-stale";
import type { AlertDigestLine } from "./notify-tenant-alerts";
import { tripNeedsPaymentUiAttention } from "./trip-payment-amounts";

const PAYMENT_ATTENTION_SELECT = {
  netAmountCents: true,
  grossAmountCents: true,
  paymentMethod: true,
  cashPaymentCents: true,
  cardPaymentCents: true,
  appPaymentCents: true,
  paymentValidated: true,
} as const;

const SYNC_PLATFORMS: SyncPlatform[] = [RidePlatform.UBER, RidePlatform.FREENOW];

function startOfMonthUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function startOfTodayLocal(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function tenantHasPlatformDrivers(tenantId: string, platform: SyncPlatform): Promise<boolean> {
  const count = await prisma.driverPlatformAccount.count({
    where: { tenantId, platform, isActive: true },
  });
  return count > 0;
}

function buildSyncAlerts(
  integrations: Awaited<ReturnType<typeof getTenantIntegrationSettings>>,
  recentSyncs: {
    platform: RidePlatform;
    status: string;
    startedAt: Date;
    finishedAt: Date | null;
  }[],
): AlertDigestLine[] {
  const alerts: AlertDigestLine[] = [];

  for (const platform of SYNC_PLATFORMS) {
    const pollingMinutes =
      platform === RidePlatform.UBER
        ? integrations.pollingMinutesUber
        : integrations.pollingMinutesFreeNow;
    const thresholdMin = Math.max(Math.round(syncStaleThresholdMs(pollingMinutes) / 60_000), 30);
    const label = syncPlatformLabel(platform);
    const platformRuns = recentSyncs.filter((r) => r.platform === platform);
    const lastSuccess = platformRuns.find((r) => r.status.toUpperCase() === "SUCCESS");
    const lastAny = platformRuns[0];
    const ref = lastSuccess?.finishedAt ?? lastSuccess?.startedAt ?? null;
    const stale = isSyncReferenceStale(ref, pollingMinutes);

    if (stale) {
      alerts.push({
        id: `sync-stale-${platform.toLowerCase()}`,
        title: `Sincronización ${label} desactualizada`,
        description: lastSuccess
          ? `Sin sync correcta en más de ${thresholdMin} min (intervalo: ${pollingMinutes} min).`
          : `Sin sync correcta reciente para ${label}.`,
      });
    } else if (lastAny && lastAny.status.toUpperCase() === "FAILED") {
      alerts.push({
        id: `sync-failed-${platform.toLowerCase()}`,
        title: `Error de sincronización ${label}`,
        description: "El último intento de sync falló. Revisa integraciones en Configuración.",
      });
    }
  }

  return alerts;
}

export type BuildOperationalAlertsOptions = {
  /** Limit trip-based alerts to drivers in scope (e.g. company filter on dashboard). */
  tripDriverWhere?: Prisma.DriverWhereInput;
};

/** Pending shift trips needing payment review (unconfirmed or unbalanced app). Same rule as Cerrar turnos AVISOS. */
export async function countPendingPaymentAlerts(
  tenantId: string,
  tripDriverWhere?: Prisma.DriverWhereInput,
): Promise<number> {
  const trips = await withTenant(tenantId, (tx) =>
    tx.trip.findMany({
      where: {
        tenantId,
        liquidationStatus: "pending",
        ...(tripDriverWhere ? { driver: tripDriverWhere } : {}),
      },
      select: PAYMENT_ATTENTION_SELECT,
    }),
  );
  return trips.filter((t) => tripNeedsPaymentUiAttention(t)).length;
}

/** Tenant operational alerts (same ids as dashboard; for email digest and UI). */
export async function buildOperationalAlertsForTenant(
  tenantId: string,
  options?: BuildOperationalAlertsOptions,
): Promise<AlertDigestLine[]> {
  const driverFilter = options?.tripDriverWhere;
  const tripWhereBase = {
    tenantId,
    ...(driverFilter ? { driver: driverFilter } : {}),
  };

  const [thresholds, integrations, monthTrips, pendingToday, unvalidatedPayments, recentSyncs] =
    await Promise.all([
    getTenantProductivityThresholds(tenantId),
    getTenantIntegrationSettings(tenantId),
    prisma.trip.findMany({
      where: { ...tripWhereBase, startedAt: { gte: startOfMonthUtc() } },
      select: {
        driverId: true,
        startedAt: true,
        endedAt: true,
        netAmountCents: true,
        driver: { select: { fullName: true } },
      },
    }),
    prisma.trip.count({
      where: {
        ...tripWhereBase,
        liquidationStatus: "pending",
        startedAt: { gte: startOfTodayLocal() },
      },
    }),
    countPendingPaymentAlerts(tenantId, driverFilter),
    prisma.syncRun.findMany({
      where: { tenantId, platform: { in: [...SYNC_PLATFORMS] } },
      orderBy: { startedAt: "desc" },
      take: 40,
      select: {
        platform: true,
        status: true,
        startedAt: true,
        finishedAt: true,
      },
    }),
  ]);

  const alerts: AlertDigestLine[] = [];

  if (unvalidatedPayments > 0) {
    alerts.push({
      id: "payment-unvalidated",
      title: "Pagos sin confirmar",
      description: `${unvalidatedPayments} viaje${unvalidatedPayments === 1 ? "" : "s"} con forma de pago pendiente o descuadrado en Cerrar turnos.`,
    });
  }

  if (pendingToday > 0) {
    alerts.push({
      id: "pending-shifts",
      title: "Turnos pendientes de cierre",
      description: `${pendingToday} viaje${pendingToday === 1 ? "" : "s"} sin liquidar hoy.`,
    });
  }

  const byDriver = new Map<string, { name: string; net: bigint; ms: number; count: number }>();
  for (const t of monthTrips) {
    const cur = byDriver.get(t.driverId) ?? {
      name: t.driver.fullName,
      net: BigInt(0),
      ms: 0,
      count: 0,
    };
    cur.net += t.netAmountCents ?? BigInt(0);
    cur.ms += tripDurationMs(t.startedAt, t.endedAt);
    cur.count += 1;
    byDriver.set(t.driverId, cur);
  }

  const lowDrivers: string[] = [];
  for (const [, agg] of byDriver) {
    if (agg.count < 2) continue;
    const hours = agg.ms / 3_600_000;
    const eurH = hours >= 0.25 ? Number(agg.net) / 100 / hours : 0;
    const tripsH = hours >= 0.25 ? agg.count / hours : 0;
    const acc = estimateAcceptanceRate(agg.count);
    if (productivityLevelFromMetrics(eurH, tripsH, acc, thresholds) === "low") {
      lowDrivers.push(agg.name);
    }
  }

  if (lowDrivers.length > 0) {
    const sample = lowDrivers.slice(0, 3).join(", ");
    const more = lowDrivers.length > 3 ? ` y ${lowDrivers.length - 3} más` : "";
    alerts.push({
      id: "productivity-low",
      title: "Conductores bajo umbral de productividad",
      description: `${lowDrivers.length} conductor${lowDrivers.length === 1 ? "" : "es"} en el mes (${sample}${more}). Umbral €/h: ${thresholds.eurPerHourMin}.`,
    });
  }

  const warnCount = [...byDriver.values()].filter((agg) => {
    if (agg.count < 2) return false;
    const hours = agg.ms / 3_600_000;
    const eurH = hours >= 0.25 ? Number(agg.net) / 100 / hours : 0;
    const tripsH = hours >= 0.25 ? agg.count / hours : 0;
    const acc = estimateAcceptanceRate(agg.count);
    return productivityLevelFromMetrics(eurH, tripsH, acc, thresholds) === "warn";
  }).length;

  if (warnCount > 0 && lowDrivers.length === 0) {
    alerts.push({
      id: "productivity-warn",
      title: "Productividad en revisión",
      description: `${warnCount} conductor${warnCount === 1 ? "" : "es"} por debajo del objetivo en al menos un indicador este mes.`,
    });
  }

  for (const platform of SYNC_PLATFORMS) {
    if (await tenantHasPlatformDrivers(tenantId, platform)) {
      alerts.push(
        ...buildSyncAlerts(integrations, recentSyncs).filter((a) =>
          a.id.includes(platform.toLowerCase()),
        ),
      );
    }
  }

  return alerts;
}

/** @deprecated Use buildOperationalAlertsForTenant */
export async function buildSyncStaleAlertsForTenant(
  tenantId: string,
): Promise<AlertDigestLine[]> {
  const all = await buildOperationalAlertsForTenant(tenantId);
  return all.filter((a) => a.id.startsWith("sync-"));
}
