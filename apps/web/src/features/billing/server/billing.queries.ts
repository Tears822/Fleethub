import "server-only";

import type { CompanyScope } from "@/features/auth/server/company-scope";
import { driverWhere } from "@/features/auth/server/company-scope";
import type {
  BillingPeriodKpi,
  BillingReport,
  BillingTableRow,
} from "@/features/billing/lib/billing-types";
import { platformSlugsFromAgg } from "@/features/billing/lib/billing-platform-filter";
import {
  addTripToAgg,
  emptyTripMoneyAgg,
  formatEuroFromCents,
  formatEuroSignedFromCents,
  type TripMoneyAgg,
} from "@/features/billing/server/trip-metrics";
import { platformKeyFromSet } from "@/features/shifts/lib/shift-platform";
import { formatDateEs } from "@/shared/lib/date-es";
import { tenantCalendarDayKey, tenantDayEndFromCalendarDate, tenantDayStartFromCalendarDate } from "@fleethub/auth/display-timezone";
import { withTenant } from "@/infrastructure/database";
import type { RidePlatform } from "@prisma/client";

export type { BillingDriverRow, BillingPeriodKpi, BillingReport, BillingTableRow } from "@/features/billing/lib/billing-types";

function formatServices(n: number): string {
  return new Intl.NumberFormat("es-ES").format(n);
}

function pctOfGross(part: bigint, gross: bigint): string {
  if (gross <= BigInt(0)) return "0,0 % del total";
  const p = (Number(part) / Number(gross)) * 100;
  return `${p.toFixed(1).replace(".", ",")} % del total`;
}

function aggToCells(agg: TripMoneyAgg): BillingTableRow["cells"] {
  return [
    formatServices(agg.count),
    formatEuroFromCents(agg.grossCents),
    formatEuroSignedFromCents(-agg.feeCents),
    formatEuroFromCents(agg.netCents),
    formatEuroFromCents(agg.appCents),
    formatEuroFromCents(agg.cashCents),
    formatEuroFromCents(agg.cardCents),
    formatEuroFromCents(agg.t3Cents),
    formatEuroFromCents(agg.tipCents),
    formatEuroFromCents(agg.bonusCents),
    formatEuroFromCents(agg.tollCents),
  ];
}

function rowFromAgg(
  rowKey: string,
  label: string,
  agg: TripMoneyAgg,
): BillingTableRow {
  return {
    rowKey,
    label,
    platform: platformKeyFromSet(agg.platforms),
    platformSlugs: platformSlugsFromAgg(agg.platforms),
    cells: aggToCells(agg),
  };
}

function pctOfGrossParams(part: bigint, gross: bigint): Record<string, string> {
  if (gross <= BigInt(0)) return { pct: "0,0" };
  const p = (Number(part) / Number(gross)) * 100;
  return { pct: p.toFixed(1).replace(".", ",") };
}

function buildPeriodKpis(totalAgg: TripMoneyAgg, driverCount: number): BillingPeriodKpi[] {
  const gross = totalAgg.grossCents;
  return [
    {
      id: "servicios",
      value: formatServices(totalAgg.count),
      hintKey: "billing.kpiHint.closedTrips",
    },
    {
      id: "factTotal",
      value: formatEuroFromCents(gross),
      hintKey: "billing.kpiHint.drivers",
      hintParams: { count: driverCount },
    },
    {
      id: "comision",
      value: formatEuroSignedFromCents(-totalAgg.feeCents),
      hintKey: "billing.kpiHint.platformFees",
      danger: true,
    },
    {
      id: "neto",
      value: formatEuroFromCents(totalAgg.netCents),
      hintKey: "billing.kpiHint.afterFees",
    },
    {
      id: "app",
      value: formatEuroFromCents(totalAgg.appCents),
      hintKey: "billing.kpiHint.pctOfTotal",
      hintParams: pctOfGrossParams(totalAgg.appCents, gross),
    },
    {
      id: "efectivo",
      value: formatEuroFromCents(totalAgg.cashCents),
      hintKey: "billing.kpiHint.pctOfTotal",
      hintParams: pctOfGrossParams(totalAgg.cashCents, gross),
    },
    {
      id: "tarjeta",
      value: formatEuroFromCents(totalAgg.cardCents),
      hintKey: "billing.kpiHint.pctOfTotal",
      hintParams: pctOfGrossParams(totalAgg.cardCents, gross),
    },
    {
      id: "t3",
      value: formatEuroFromCents(totalAgg.t3Cents),
      hintKey: "billing.kpiHint.pctOfTotal",
      hintParams: pctOfGrossParams(totalAgg.t3Cents, gross),
      highlight: true,
    },
    {
      id: "propinas",
      value: formatEuroFromCents(totalAgg.tipCents),
      hintKey: "billing.kpiHint.pctOfTotal",
      hintParams: pctOfGrossParams(totalAgg.tipCents, gross),
    },
    {
      id: "primas",
      value: formatEuroFromCents(totalAgg.bonusCents),
      hintKey: "billing.kpiHint.platformBonus",
      highlight: true,
    },
    {
      id: "peajes",
      value: formatEuroFromCents(totalAgg.tollCents),
      hintKey: "billing.kpiHint.tolls",
    },
  ];
}

const PLATFORM_LABELS: Record<RidePlatform, string> = {
  UBER: "Uber",
  FREENOW: "FreeNow",
  BOLT: "Bolt",
  CABIFY: "Cabify",
};

async function loadPendingInPeriod(
  tenantId: string,
  scope: CompanyScope,
  dateFrom: Date,
  rangeEnd: Date,
): Promise<BillingReport["pendingInPeriod"] | undefined> {
  const pendingWhere = {
    tenantId,
    liquidationStatus: "pending" as const,
    startedAt: { gte: dateFrom, lte: rangeEnd },
    driver: driverWhere(scope),
  };

  const [tripCount, drivers] = await withTenant(tenantId, (tx) =>
    Promise.all([
      tx.trip.count({ where: pendingWhere }),
      tx.trip.groupBy({
        by: ["driverId"],
        where: pendingWhere,
      }),
    ]),
  );

  if (tripCount === 0) return undefined;
  return { tripCount, driverCount: drivers.length };
}

export async function listBillingReport(
  tenantId: string,
  scope: CompanyScope,
  dateFrom: Date,
  dateTo: Date,
): Promise<BillingReport> {
  const rangeStart = tenantDayStartFromCalendarDate(dateFrom);
  const rangeEnd = tenantDayEndFromCalendarDate(dateTo);

  const [trips, pendingInPeriod] = await Promise.all([
    withTenant(tenantId, (tx) =>
    tx.trip.findMany({
      where: {
        tenantId,
        liquidationStatus: "closed",
        startedAt: { gte: rangeStart, lte: rangeEnd },
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
        fareType: true,
        platformBonusCents: true,
        paymentMethod: true,
        cashPaymentCents: true,
        cardPaymentCents: true,
        appPaymentCents: true,
        paymentValidated: true,
        driver: { select: { id: true, fullName: true } },
      },
      orderBy: { startedAt: "asc" },
    }),
    ),
    loadPendingInPeriod(tenantId, scope, rangeStart, rangeEnd),
  ]);

  const byDriver = new Map<string, TripMoneyAgg & { fullName: string }>();
  const byDay = new Map<string, TripMoneyAgg>();
  const byPlatform = new Map<RidePlatform, TripMoneyAgg>();
  const totalAgg = emptyTripMoneyAgg();

  for (const trip of trips) {
    addTripToAgg(totalAgg, trip);

    let platAgg = byPlatform.get(trip.platform);
    if (!platAgg) {
      platAgg = emptyTripMoneyAgg();
      byPlatform.set(trip.platform, platAgg);
    }
    addTripToAgg(platAgg, trip);

    let driverAgg = byDriver.get(trip.driver.id);
    if (!driverAgg) {
      driverAgg = { ...emptyTripMoneyAgg(), fullName: trip.driver.fullName };
      byDriver.set(trip.driver.id, driverAgg);
    }
    addTripToAgg(driverAgg, trip);

    const dayKey = tenantCalendarDayKey(trip.startedAt);
    let dayAgg = byDay.get(dayKey);
    if (!dayAgg) {
      dayAgg = emptyTripMoneyAgg();
      byDay.set(dayKey, dayAgg);
    }
    addTripToAgg(dayAgg, trip);
  }

  const driverRows: BillingTableRow[] = [...byDriver.entries()]
    .map(([driverId, agg]) => rowFromAgg(driverId, agg.fullName, agg))
    .sort((a, b) => a.label.localeCompare(b.label, "es"));

  const dayRows: BillingTableRow[] = [...byDay.entries()]
    .map(([dayKey, agg]) => {
      const parts = dayKey.split("-");
      const y = Number(parts[0]);
      const m = Number(parts[1]);
      const d = Number(parts[2]);
      const label =
        Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)
          ? formatDateEs(new Date(y, m - 1, d))
          : dayKey;
      return rowFromAgg(dayKey, label, agg);
    })
    .sort((a, b) => b.rowKey.localeCompare(a.rowKey));

  const globalRows: BillingTableRow[] = [
    rowFromAgg("total", "Total periodo", totalAgg),
    ...[...byPlatform.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([platform, agg]) =>
        rowFromAgg(`platform-${platform}`, PLATFORM_LABELS[platform] ?? platform, agg),
      ),
  ];

  const periodKpis = buildPeriodKpis(totalAgg, driverRows.length);

  return { byDriver: driverRows, byDay: dayRows, globalRows, periodKpis, pendingInPeriod };
}

/** @deprecated Prefer listBillingReport */
export async function listBillingByDriver(
  tenantId: string,
  scope: CompanyScope,
  dateFrom: Date,
  dateTo: Date,
): Promise<{ rows: BillingTableRow[]; periodKpis: BillingPeriodKpi[] }> {
  const report = await listBillingReport(tenantId, scope, dateFrom, dateTo);
  return { rows: report.byDriver, periodKpis: report.periodKpis };
}
