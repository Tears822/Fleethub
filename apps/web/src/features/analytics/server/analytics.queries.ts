import "server-only";

import type { CompanyScope } from "@/features/auth/server/company-scope";
import { driverWhere } from "@/features/auth/server/company-scope";
import type { AnalyticsRow } from "@/features/analytics/lib/analitica-mock-data";
import {
  addTripToAgg,
  emptyTripMoneyAgg,
  eurosFromCents,
  type TripMoneyAgg,
} from "@/features/billing/server/trip-metrics";
import type { AnalyticsPlatformFilter } from "@/features/analytics/lib/analytics-platform";
import { ridePlatformForAnalyticsFilter } from "@/features/analytics/lib/analytics-platform";
import { platformKeyFromSet } from "@/features/shifts/lib/shift-platform";
import { tenantDayEndFromCalendarDate, tenantDayStartFromCalendarDate } from "@fleethub/auth/display-timezone";
import { withTenant } from "@fleethub/db";
import type { RidePlatform } from "@prisma/client";

export async function listAnalyticsByDriver(
  tenantId: string,
  scope: CompanyScope,
  dateFrom: Date,
  dateTo: Date,
  platformFilter: AnalyticsPlatformFilter = "total",
): Promise<{ rows: AnalyticsRow[] }> {
  const ridePlatform = ridePlatformForAnalyticsFilter(platformFilter);
  const rangeStart = tenantDayStartFromCalendarDate(dateFrom);
  const rangeEnd = tenantDayEndFromCalendarDate(dateTo);

  const trips = await withTenant(tenantId, (tx) =>
    tx.trip.findMany({
      where: {
        tenantId,
        liquidationStatus: "closed",
        startedAt: { gte: rangeStart, lte: rangeEnd },
        ...(ridePlatform ? { platform: ridePlatform } : {}),
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
        platformBonusCents: true,
        tollCents: true,
        paymentMethod: true,
        cashPaymentCents: true,
        cardPaymentCents: true,
        appPaymentCents: true,
        paymentValidated: true,
        fareType: true,
        driver: { select: { id: true, fullName: true } },
      },
    }),
  );

  const byDriver = new Map<string, TripMoneyAgg & { fullName: string }>();

  for (const trip of trips) {
    let row = byDriver.get(trip.driver.id);
    if (!row) {
      row = { ...emptyTripMoneyAgg(), fullName: trip.driver.fullName };
      byDriver.set(trip.driver.id, row);
    }
    addTripToAgg(row, trip);
  }

  const rows: AnalyticsRow[] = [...byDriver.values()].map((agg) => {
    const facturacion = eurosFromCents(agg.grossCents);
    const comisiones = -eurosFromCents(agg.feeCents);
    const turnos = agg.shiftDays.size;
    const hours = Math.max(0.5, agg.totalDurationMs / 3_600_000);
    return {
      conductor: agg.fullName,
      platform: platformKeyFromSet(agg.platforms),
      platforms: [...agg.platforms] as RidePlatform[],
      facturacion,
      comisiones,
      viajes: agg.count,
      turnos: Math.max(1, turnos),
      mediaTurno:
        turnos > 0 ? Math.round((facturacion / turnos) * 100) / 100 : facturacion,
      eurHora: Math.round((facturacion / hours) * 100) / 100,
      propinas: eurosFromCents(agg.tipCents),
      primas: eurosFromCents(agg.bonusCents),
      estado: "medio",
    };
  });

  rows.sort((a, b) => b.facturacion - a.facturacion);

  return { rows };
}
