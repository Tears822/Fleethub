import "server-only";

import { listClosedLiquidationEventsForTenant } from "@fleethub/auth";
import type { CompanyScope } from "@/features/auth/server/company-scope";
import { driverWhere } from "@/features/auth/server/company-scope";
import { closedShiftRowsFromEvents } from "@/features/shifts/server/closed-shifts-from-events";
import type { TripForAggregation } from "@/features/shifts/server/shift-trip-aggregation";
import { tripAggregationSelect } from "@/features/shifts/server/trip-select";
import type { ClosedShiftRow } from "@/features/shifts/ui/cerrar-turnos-types";
import { withTenant } from "@/infrastructure/database";

export async function listClosedShiftRows(
  tenantId: string,
  scope: CompanyScope,
  options?: { dateFrom?: Date; dateTo?: Date },
): Promise<ClosedShiftRow[]> {
  let dateTo = options?.dateTo;
  if (dateTo) {
    const end = new Date(dateTo);
    end.setHours(23, 59, 59, 999);
    dateTo = end;
  }

  const events = await listClosedLiquidationEventsForTenant(tenantId, scope, {
    dateFrom: options?.dateFrom,
    dateTo,
  });
  if (events.length === 0) return [];

  const tripIdSet = new Set(events.flatMap((e) => e.tripIds));

  const trips = await withTenant(tenantId, (tx) =>
    tx.trip.findMany({
      where: {
        tenantId,
        id: { in: [...tripIdSet] },
        liquidationStatus: "closed",
        driver: driverWhere(scope),
      },
      select: tripAggregationSelect,
    }),
  );

  const tripsById = new Map<string, TripForAggregation>(
    trips.map((t) => [t.id, t as TripForAggregation]),
  );

  return closedShiftRowsFromEvents(events, tripsById);
}
