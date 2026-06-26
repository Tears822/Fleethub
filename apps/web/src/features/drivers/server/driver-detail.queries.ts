import "server-only";

import type { CompanyScope } from "@/features/auth/server/company-scope";
import { driverWhere } from "@/features/auth/server/company-scope";
import {
  addTripToAgg,
  emptyTripMoneyAgg,
  formatEuroFromCents,
} from "@/features/billing/server/trip-metrics";
import { tripDurationMs } from "@fleethub/auth/driver-productivity";
import { listClosedLiquidationEventsForTenant } from "@fleethub/auth";
import type { TripForAggregation } from "@/features/shifts/server/shift-trip-aggregation";
import { closedShiftRowsFromEvents } from "@/features/shifts/server/closed-shifts-from-events";
import type { DriverPerformanceStats } from "@/features/drivers/lib/driver-performance-types";
import type { ClosedShiftRow } from "@/features/shifts/ui/cerrar-turnos-types";
import { tripAggregationSelect } from "@/features/shifts/server/trip-select";
import { withTenant } from "@/infrastructure/database";

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function daysAgoUtc(days: number): Date {
  const d = startOfTodayUtc();
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

export type DriverDetailStats = {
  todayFacturacion: string;
  todayViajes: number;
  todayHoras: string;
  todayEurH: string;
  closedShifts: ClosedShiftRow[];
  last7Days: Array<{ date: string; viajes: number; net: string }>;
  monthlyHistory: Array<{
    monthKey: string;
    label: string;
    viajes: number;
    facturacion: string;
    horas: string;
    eurH: string;
  }>;
  hasLiveData: boolean;
  performance: DriverPerformanceStats | null;
};

function formatDurationHoursMinutes(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(totalMinutes / 60);
  const min = totalMinutes % 60;
  return `${h}h ${min}min`;
}

function formatEurH(cents: bigint, ms: number): string {
  const hours = ms / 3_600_000;
  if (hours < 0.25) return "0,00";
  const eur = Number(cents) / 100 / hours;
  return eur.toFixed(2).replace(".", ",");
}

function monthBoundsUtc(year: number, monthIndex: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999));
  return { start, end };
}

type PerfTrip = {
  startedAt: Date;
  endedAt: Date | null;
  grossAmountCents: bigint | null;
  netAmountCents: bigint | null;
  driverId: string;
  driver: { id: string; fullName: string };
};

function grossCents(t: { grossAmountCents: bigint | null; netAmountCents: bigint | null }): bigint {
  const net = t.netAmountCents ?? BigInt(0);
  const gross = t.grossAmountCents ?? BigInt(0);
  return gross > BigInt(0) ? gross : net;
}

function aggregateDriverMonth(
  trips: PerfTrip[],
  driverId: string,
): { gross: bigint; net: bigint; ms: number; count: number } {
  let gross = BigInt(0);
  let net = BigInt(0);
  let ms = 0;
  let count = 0;
  for (const t of trips) {
    if (t.driverId !== driverId) continue;
    count += 1;
    gross += grossCents(t);
    net += t.netAmountCents ?? BigInt(0);
    ms += tripDurationMs(t.startedAt, t.endedAt);
  }
  return { gross, net, ms, count };
}

function buildPerformanceStats(
  driverId: string,
  driverName: string,
  closedTrips: PerfTrip[],
  fleetMonthTrips: PerfTrip[],
): DriverPerformanceStats | null {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const cur = monthBoundsUtc(y, m);
  const prev = monthBoundsUtc(m === 0 ? y - 1 : y, m === 0 ? 11 : m - 1);

  const inRange = (t: PerfTrip, start: Date, end: Date) =>
    t.startedAt >= start && t.startedAt <= end;

  const monthTrips = closedTrips.filter((t) => inRange(t, cur.start, cur.end));
  const prevTrips = closedTrips.filter((t) => inRange(t, prev.start, prev.end));
  const monthAgg = aggregateDriverMonth(monthTrips, driverId);
  const prevAgg = aggregateDriverMonth(prevTrips, driverId);

  if (monthAgg.count === 0 && prevAgg.count === 0) {
    const anyClosed = closedTrips.some((t) => t.driverId === driverId);
    if (!anyClosed) return null;
  }

  const facturacionVsPrevPct =
    prevAgg.gross > BigInt(0)
      ? Math.round(
          ((Number(monthAgg.gross) - Number(prevAgg.gross)) / Number(prevAgg.gross)) * 100,
        )
      : null;

  const hours = monthAgg.ms / 3_600_000;
  const eurH = hours >= 0.25 ? Number(monthAgg.net) / 100 / hours : 0;
  const daysWithData = new Set(monthTrips.map((t) => t.startedAt.getUTCDate())).size;
  const viajesPerDay = daysWithData > 0 ? monthAgg.count / daysWithData : monthAgg.count;

  const byDay = new Map<number, bigint>();
  for (const t of monthTrips) {
    if (t.driverId !== driverId) continue;
    const day = t.startedAt.getUTCDate();
    byDay.set(day, (byDay.get(day) ?? BigInt(0)) + grossCents(t));
  }
  const dailyBilling = [...byDay.entries()]
    .sort(([a], [b]) => a - b)
    .map(([day, cents]) => ({ day, amountEur: Math.round(Number(cents) / 100) }));

  const byMonth = new Map<string, bigint>();
  for (const t of closedTrips) {
    if (t.driverId !== driverId) continue;
    const key = `${t.startedAt.getUTCFullYear()}-${t.startedAt.getUTCMonth()}`;
    byMonth.set(key, (byMonth.get(key) ?? BigInt(0)) + grossCents(t));
  }
  const evolution6m: Array<{ label: string; amountEur: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - i, 1));
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    const label = new Intl.DateTimeFormat("es-ES", { month: "short" }).format(d);
    const cents = byMonth.get(key) ?? BigInt(0);
    evolution6m.push({
      label: label.charAt(0).toUpperCase() + label.slice(1),
      amountEur: Math.round(Number(cents) / 100),
    });
  }

  const fleetByDriver = new Map<string, { name: string; gross: bigint }>();
  for (const t of fleetMonthTrips) {
    const g = grossCents(t);
    const curRow = fleetByDriver.get(t.driver.id) ?? {
      name: t.driver.fullName,
      gross: BigInt(0),
    };
    curRow.gross += g;
    fleetByDriver.set(t.driver.id, curRow);
  }
  const ranked = [...fleetByDriver.entries()].sort((a, b) =>
    Number(b[1].gross - a[1].gross),
  );
  const rankingPosition = ranked.findIndex(([id]) => id === driverId);
  const peerComparison = ranked.slice(0, 8).map(([id, row]) => ({
    name: id === driverId ? driverName.split(" ")[0] ?? driverName : row.name.split(" ")[0] ?? row.name,
    amountEur: Math.round(Number(row.gross) / 100),
    isCurrent: id === driverId,
  }));

  const monthTitle = new Intl.DateTimeFormat("es-ES", {
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(y, m, 1)));

  return {
    monthTitle: monthTitle.charAt(0).toUpperCase() + monthTitle.slice(1),
    facturacionMes: formatEuroFromCents(monthAgg.gross),
    facturacionMesEur: Math.round(Number(monthAgg.gross) / 100),
    facturacionVsPrevPct,
    viajesMes: monthAgg.count,
    viajesPerDayLabel: viajesPerDay.toFixed(1).replace(".", ","),
    eurHoraMes: eurH.toFixed(2).replace(".", ","),
    horasMesLabel: formatDurationHoursMinutes(monthAgg.ms),
    rankingPosition: rankingPosition >= 0 ? rankingPosition + 1 : null,
    rankingTotal: ranked.length,
    dailyBilling,
    dailyBillingTotal: formatEuroFromCents(monthAgg.gross),
    evolution6m,
    peerComparison,
  };
}

export async function getDriverDetailStats(
  tenantId: string,
  driverId: string,
  scope: CompanyScope,
): Promise<DriverDetailStats | null> {
  const driverRow = await withTenant(tenantId, (tx) =>
    tx.driver.findFirst({
      where: { id: driverId, ...driverWhere(scope) },
      select: { id: true, fullName: true },
    }),
  );
  if (!driverRow) return null;

  const todayStart = startOfTodayUtc();
  const weekStart = daysAgoUtc(6);

  const yearStart = new Date();
  yearStart.setUTCMonth(yearStart.getUTCMonth() - 11, 1);
  yearStart.setUTCHours(0, 0, 0, 0);

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const perfSelect = {
    startedAt: true,
    endedAt: true,
    grossAmountCents: true,
    netAmountCents: true,
    driverId: true,
    driver: { select: { id: true, fullName: true } },
  } as const;

  const [todayTrips, weekTrips, closedTripsHistory, fleetMonthTrips] = await withTenant(
    tenantId,
    async (tx) => {
    const baseWhere = { tenantId, driverId };
    return Promise.all([
      tx.trip.findMany({
        where: { ...baseWhere, startedAt: { gte: todayStart } },
        select: {
          startedAt: true,
          endedAt: true,
          grossAmountCents: true,
          platformFeeCents: true,
          netAmountCents: true,
          tipCents: true,
          tollCents: true,
          paymentMethod: true,
          platform: true,
        },
      }),
      tx.trip.findMany({
        where: { ...baseWhere, startedAt: { gte: weekStart } },
        select: { startedAt: true, netAmountCents: true },
      }),
      tx.trip.findMany({
        where: {
          ...baseWhere,
          liquidationStatus: "closed",
          startedAt: { gte: yearStart },
        },
        select: perfSelect,
      }),
      tx.trip.findMany({
        where: {
          tenantId,
          liquidationStatus: "closed",
          startedAt: { gte: monthStart },
          driver: driverWhere(scope),
        },
        select: perfSelect,
      }),
    ]);
  });

  const todayAgg = emptyTripMoneyAgg();
  for (const t of todayTrips) addTripToAgg(todayAgg, t);

  const byDay = new Map<string, { viajes: number; net: bigint }>();
  for (const t of weekTrips) {
    const key = t.startedAt.toISOString().slice(0, 10);
    const cur = byDay.get(key) ?? { viajes: 0, net: BigInt(0) };
    cur.viajes += 1;
    cur.net += t.netAmountCents ?? BigInt(0);
    byDay.set(key, cur);
  }

  const last7Days = [...byDay.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 7)
    .map(([date, v]) => ({
      date: new Intl.DateTimeFormat("es-ES", {
        day: "2-digit",
        month: "2-digit",
      }).format(new Date(`${date}T12:00:00Z`)),
      viajes: v.viajes,
      net: formatEuroFromCents(v.net),
    }));

  const driverEvents = (await listClosedLiquidationEventsForTenant(tenantId, scope)).filter(
    (e) => e.driverId === driverId,
  );
  const eventTripIds = [...new Set(driverEvents.flatMap((e) => e.tripIds))];
  const closedTripsForEvents =
    eventTripIds.length > 0
      ? await withTenant(tenantId, (tx) =>
          tx.trip.findMany({
            where: {
              tenantId,
              driverId,
              id: { in: eventTripIds },
              liquidationStatus: "closed",
            },
            select: tripAggregationSelect,
          }),
        )
      : [];
  const closedTripsById = new Map<string, TripForAggregation>(
    closedTripsForEvents.map((t) => [t.id, t as TripForAggregation]),
  );
  const closedShifts: ClosedShiftRow[] = closedShiftRowsFromEvents(
    driverEvents,
    closedTripsById,
  );

  const byMonth = new Map<string, { gross: bigint; net: bigint; ms: number; count: number }>();
  for (const t of closedTripsHistory) {
    const key = `${t.startedAt.getUTCFullYear()}-${String(t.startedAt.getUTCMonth() + 1).padStart(2, "0")}`;
    const cur = byMonth.get(key) ?? { gross: BigInt(0), net: BigInt(0), ms: 0, count: 0 };
    cur.gross += grossCents(t);
    cur.net += t.netAmountCents ?? BigInt(0);
    cur.ms += tripDurationMs(t.startedAt, t.endedAt);
    cur.count += 1;
    byMonth.set(key, cur);
  }

  const monthlyHistory = [...byMonth.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 12)
    .map(([monthKey, v]) => {
      const [y, m] = monthKey.split("-");
      const label = new Intl.DateTimeFormat("es-ES", {
        month: "short",
        year: "numeric",
      }).format(new Date(Date.UTC(Number(y), Number(m) - 1, 1)));
      const hours = v.ms / 3_600_000;
      const eurH = hours >= 0.25 ? Number(v.net) / 100 / hours : 0;
      return {
        monthKey,
        label,
        viajes: v.count,
        facturacion: formatEuroFromCents(v.gross),
        horas: formatDurationHoursMinutes(v.ms),
        eurH: eurH.toFixed(2).replace(".", ","),
      };
    });

  const performance = buildPerformanceStats(
    driverId,
    driverRow.fullName,
    closedTripsHistory as PerfTrip[],
    fleetMonthTrips as PerfTrip[],
  );

  const hasLiveData =
    todayTrips.length > 0 ||
    weekTrips.length > 0 ||
    closedTripsHistory.length > 0 ||
    performance !== null;

  return {
    todayFacturacion: formatEuroFromCents(todayAgg.grossCents),
    todayViajes: todayAgg.count,
    todayHoras: formatDurationHoursMinutes(todayAgg.totalDurationMs),
    todayEurH: formatEurH(todayAgg.netCents, todayAgg.totalDurationMs),
    closedShifts,
    last7Days,
    monthlyHistory,
    performance,
    hasLiveData,
  };
}
