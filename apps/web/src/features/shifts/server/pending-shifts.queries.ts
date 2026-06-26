import "server-only";

import type { CompanyScope } from "@/features/auth/server/company-scope";
import { driverWhere } from "@/features/auth/server/company-scope";
import {
  aggregateTripsByDriver,
  formatDateRange,
  mapGroupToShiftRow,
} from "@/features/shifts/server/shift-trip-aggregation";
import {
  computeTurnoAbiertoByDriver,
  endOfLocalDay,
  startOfLocalDay,
} from "@/features/shifts/lib/shift-open-status";
import { tripAggregationSelect } from "@/features/shifts/server/trip-select";
import type { CerrarTurnosRow } from "@/features/shifts/ui/cerrar-turnos-types";
import { withTenant } from "@/infrastructure/database";

export type PendingShiftRow = CerrarTurnosRow & {
  driverId: string;
  tripIds: string[];
};

export async function listPendingShiftRows(
  tenantId: string,
  scope: CompanyScope,
): Promise<PendingShiftRow[]> {
  const trips = await withTenant(tenantId, (tx) =>
    tx.trip.findMany({
      where: {
        tenantId,
        liquidationStatus: "pending",
        driver: driverWhere(scope),
      },
      select: tripAggregationSelect,
      orderBy: { startedAt: "asc" },
    }),
  );

  const todayStart = startOfLocalDay(new Date());
  const todayEnd = endOfLocalDay(new Date());
  const driverIds = [...new Set(trips.map((t) => t.driver.id))];

  const liquidationsToday =
    driverIds.length === 0
      ? []
      : await withTenant(tenantId, (tx) =>
          tx.shiftLiquidation.findMany({
            where: {
              tenantId,
              status: "active",
              closedAt: { gte: todayStart, lte: todayEnd },
              driverId: { in: driverIds },
              driver: driverWhere(scope),
            },
            select: { driverId: true, closedAt: true },
          }),
        );

  const turnoAbiertoByDriver = computeTurnoAbiertoByDriver(
    trips.map((t) => ({ driverId: t.driver.id, startedAt: t.startedAt })),
    liquidationsToday,
  );

  return aggregateTripsByDriver(trips).map((g) => {
    const row = mapGroupToShiftRow(g);
    return {
      driverId: g.driver.id,
      tripIds: g.tripIds,
      periodFromIso: g.minDate.toISOString(),
      periodToIso: g.maxDate.toISOString(),
      conductor: g.driver.fullName,
      rango: formatDateRange(g.minDate, g.maxDate),
      activo: g.driver.isActive,
      turnoAbierto: turnoAbiertoByDriver.get(g.driver.id) ?? false,
      ...row,
    };
  });
}
