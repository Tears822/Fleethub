/**
 * Dashboard KPIs, 14-day chart, top drivers.
 *
 * Business definitions (target): docs/especificacion-datos/pantalla-1-dashboard.md
 */
import "server-only";

import type { CompanyScope } from "@/features/auth/server/company-scope";
import { driverWhere } from "@/features/auth/server/company-scope";
import type {
  MockDashboardKpi,
  MockRevenuePoint,
  MockTopDriver,
} from "@/features/dashboard/mock/dashboard-mock";
import type { ConnectedNowSnapshot } from "@/features/dashboard/server/dashboard-connected-now.queries";
import {
  AlarmClock,
  Bell,
  Car,
  Clock3,
  Euro,
  Radio,
  UsersRound,
} from "lucide-react";
import type { TopDriversPeriod } from "@/features/dashboard/lib/top-drivers-period";
import { topDriversPeriodStart } from "@/features/dashboard/lib/top-drivers-period";
import { countDriversActiveToday } from "@/features/shifts/lib/shift-active-today";
import {
  computeTurnoAbiertoByDriver,
  endOfLocalDay,
  startOfLocalDay,
} from "@/features/shifts/lib/shift-open-status";
import { countPendingPaymentAlerts } from "@fleethub/auth";
import { withTenant } from "@/infrastructure/database";

const APP_PLATFORMS = ["UBER", "FREENOW"] as const;

function formatEuroInt(cents: bigint): string {
  const euros = Math.round(Number(cents) / 100);
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(euros);
}

function shortDayLabel(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

function tripGrossCents(trip: {
  grossAmountCents: bigint | null;
  netAmountCents: bigint | null;
}): bigint {
  const gross = trip.grossAmountCents;
  if (gross != null && gross > BigInt(0)) return gross;
  return trip.netAmountCents ?? BigInt(0);
}

function isAppPlatform(platform: string): boolean {
  return (APP_PLATFORMS as readonly string[]).includes(platform);
}

export type DashboardOperativaSnapshot = {
  kpis: MockDashboardKpi[];
  revenue14d: MockRevenuePoint[];
  topDrivers: MockTopDriver[];
  topDriversPeriod: TopDriversPeriod;
  hasLiveTrips: boolean;
  chartRangeLabel: string;
  /** Pending trips with payment type not confirmed (Cerrar turnos AVISOS). */
  paymentAlertCount: number;
};

export function applyConnectedNowToKpis(
  kpis: MockDashboardKpi[],
  connected: ConnectedNowSnapshot,
): MockDashboardKpi[] {
  const card: MockDashboardKpi = {
    id: "connectedNow",
    value: String(connected.count),
    hint: connected.hint,
    icon: Radio,
    accent: connected.count > 0 ? "green" : "brand",
  };

  const next: MockDashboardKpi[] = [];
  for (const k of kpis) {
    next.push(k);
    if (k.id === "openShiftsNow") {
      next.push(card);
    }
  }
  if (!next.some((k) => k.id === "connectedNow")) {
    next.splice(2, 0, card);
  }
  return next;
}

/** Same metric as Cerrar turnos column AVISOS: pending trips with `paymentValidated = false`. */
export function applyPaymentAlertCountToKpis(
  kpis: MockDashboardKpi[],
  paymentAlertCount: number,
): MockDashboardKpi[] {
  return kpis.map((k) =>
    k.id === "alerts"
      ? {
          ...k,
          value: String(paymentAlertCount),
          icon: Bell,
          accent: paymentAlertCount > 0 ? "red" : "green",
        }
      : k,
  );
}

/** @deprecated Use applyPaymentAlertCountToKpis */
export const applyActionableAlertCountToKpis = applyPaymentAlertCountToKpis;

export async function loadDashboardOperativaSnapshot(
  tenantId: string,
  scope: CompanyScope,
  topDriversPeriod: TopDriversPeriod = "today",
): Promise<DashboardOperativaSnapshot> {
  const today = new Date();
  const todayStart = startOfLocalDay(today);
  const todayEnd = endOfLocalDay(today);
  const seriesStart = startOfLocalDay(new Date(today.getTime() - 13 * 24 * 60 * 60 * 1000));
  const topPeriodStart = topDriversPeriodStart(topDriversPeriod, today);

  const [
    trips,
    totalDrivers,
    pendingDriverIds,
    pendingTripsForOpen,
    liquidationsToday,
    shiftsStartedToday,
    paymentAlertCount,
  ] = await Promise.all([
    withTenant(tenantId, (tx) =>
      tx.trip.findMany({
        where: {
          tenantId,
          startedAt: { gte: seriesStart, lte: todayEnd },
          driver: driverWhere(scope),
        },
        select: {
          driverId: true,
          platform: true,
          startedAt: true,
          grossAmountCents: true,
          netAmountCents: true,
          liquidationStatus: true,
          driver: { select: { fullName: true, isActive: true } },
        },
      }),
    ),
    withTenant(tenantId, (tx) =>
      tx.driver.count({ where: { ...driverWhere(scope), isActive: true } }),
    ),
    withTenant(tenantId, (tx) =>
      tx.trip.groupBy({
        by: ["driverId"],
        where: {
          tenantId,
          liquidationStatus: "pending",
          driver: driverWhere(scope),
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
          closedAt: { gte: todayStart, lte: todayEnd },
          driver: driverWhere(scope),
        },
        select: { driverId: true, closedAt: true },
      }),
    ),
    withTenant(tenantId, (tx) =>
      tx.shiftLiquidation.findMany({
        where: {
          tenantId,
          status: "active",
          periodFrom: { gte: todayStart, lte: todayEnd },
          driver: driverWhere(scope),
        },
        select: { driverId: true, periodFrom: true },
      }),
    ),
    countPendingPaymentAlerts(tenantId, driverWhere(scope)),
  ]);

  const hasLiveTrips = trips.some((t) => t.liquidationStatus === "closed");

  const todayTrips = trips.filter(
    (t) => t.startedAt >= todayStart && t.startedAt <= todayEnd,
  );
  const todayClosed = todayTrips.filter((t) => t.liquidationStatus === "closed");
  const todayClosedApp = todayClosed.filter((t) => isAppPlatform(t.platform));
  const activeDriversToday = countDriversActiveToday({
    shiftPeriodsToday: shiftsStartedToday,
    tripDriverIdsToday: todayTrips.map((t) => t.driverId),
  });

  const dayGross = todayClosed.reduce((s, t) => s + tripGrossCents(t), BigInt(0));

  const byDriverTop = new Map<string, { name: string; cents: bigint }>();
  for (const t of trips) {
    if (t.liquidationStatus !== "closed") continue;
    if (t.startedAt < topPeriodStart || t.startedAt > todayEnd) continue;
    const cur = byDriverTop.get(t.driverId) ?? {
      name: t.driver.fullName,
      cents: BigInt(0),
    };
    cur.cents += tripGrossCents(t);
    byDriverTop.set(t.driverId, cur);
  }

  const topDrivers: MockTopDriver[] = [...byDriverTop.values()]
    .map((d) => ({ name: d.name, euro: Math.round(Number(d.cents) / 100) }))
    .sort((a, b) => b.euro - a.euro)
    .slice(0, 5);

  const pendingDriverCount = pendingDriverIds.length;

  const turnoAbiertoByDriver = computeTurnoAbiertoByDriver(
    pendingTripsForOpen,
    liquidationsToday,
  );
  const openShiftCount = [...turnoAbiertoByDriver.values()].filter(Boolean).length;

  const byDay = new Map<string, bigint>();
  for (const t of trips) {
    if (t.liquidationStatus !== "closed") continue;
    const key = t.startedAt.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? BigInt(0)) + tripGrossCents(t));
  }

  const revenue14d: MockRevenuePoint[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(todayStart);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const cents = byDay.get(key) ?? BigInt(0);
    revenue14d.push({
      day: shortDayLabel(d),
      euro: Math.round(Number(cents) / 100),
    });
  }

  const chartRangeLabel = `${shortDayLabel(seriesStart)} – ${shortDayLabel(todayStart)}`;

  const kpis: MockDashboardKpi[] = [
    {
      id: "activeDriversToday",
      value: String(activeDriversToday),
      hintParams: { totalDrivers },
      icon: UsersRound,
    },
    {
      id: "openShiftsNow",
      value: String(openShiftCount),
      icon: Clock3,
    },
    {
      id: "dayBilling",
      value: formatEuroInt(dayGross),
      icon: Euro,
    },
    {
      id: "tripsToday",
      value: String(todayClosedApp.length),
      icon: Car,
    },
    {
      id: "pendingShifts",
      value: String(pendingDriverCount),
      icon: AlarmClock,
      accent: pendingDriverCount > 0 ? "amber" : "green",
    },
    {
      id: "alerts",
      value: String(paymentAlertCount),
      icon: Bell,
      accent: paymentAlertCount > 0 ? "red" : "green",
    },
  ];

  return {
    kpis,
    paymentAlertCount,
    revenue14d,
    topDrivers,
    topDriversPeriod,
    hasLiveTrips,
    chartRangeLabel,
  };
}

/** Zeros when operativa query fails or tenant has no trips yet. */
export function buildEmptyDashboardOperativaSnapshot(
  totalDrivers = 0,
): DashboardOperativaSnapshot {
  const today = new Date();
  const todayStart = startOfLocalDay(today);
  const seriesStart = startOfLocalDay(new Date(today.getTime() - 13 * 24 * 60 * 60 * 1000));
  const revenue14d: MockRevenuePoint[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(todayStart);
    d.setDate(d.getDate() - i);
    revenue14d.push({ day: shortDayLabel(d), euro: 0 });
  }

  const kpis: MockDashboardKpi[] = [
    {
      id: "activeDriversToday",
      value: "0",
      hintParams: totalDrivers > 0 ? { totalDrivers } : undefined,
      icon: UsersRound,
    },
    {
      id: "openShiftsNow",
      value: "0",
      icon: Clock3,
    },
    {
      id: "dayBilling",
      value: formatEuroInt(BigInt(0)),
      icon: Euro,
    },
    {
      id: "tripsToday",
      value: "0",
      icon: Car,
    },
    {
      id: "pendingShifts",
      value: "0",
      icon: AlarmClock,
      accent: "green",
    },
    {
      id: "alerts",
      value: "0",
      icon: Bell,
      accent: "green",
    },
  ];

  return {
    kpis,
    revenue14d,
    topDrivers: [],
    topDriversPeriod: "today",
    hasLiveTrips: false,
    chartRangeLabel: `${shortDayLabel(seriesStart)} – ${shortDayLabel(todayStart)}`,
    paymentAlertCount: 0,
  };
}
