import "server-only";

import type { ClosedLiquidationEvent } from "@fleethub/auth";
import {
  aggregateTripsByDriver,
  formatDateTimeRange,
  mapGroupsToClosedShiftRows,
} from "@/features/shifts/server/shift-trip-aggregation";
import type { TripForAggregation } from "@/features/shifts/server/shift-trip-aggregation";
import { expandShiftRowsForTable } from "@/features/shifts/lib/shift-platform-filter";
import type { ClosedShiftRow } from "@/features/shifts/ui/cerrar-turnos-types";

export function closedShiftRowsFromEvents(
  events: ClosedLiquidationEvent[],
  tripsById: Map<string, TripForAggregation>,
): ClosedShiftRow[] {
  const rows: ClosedShiftRow[] = [];

  for (const event of events) {
    const eventTrips: TripForAggregation[] = [];
    for (const id of event.tripIds) {
      const trip = tripsById.get(id);
      if (trip) eventTrips.push(trip);
    }
    if (eventTrips.length === 0) continue;

    const groups = aggregateTripsByDriver(eventTrips);
    const mapped = mapGroupsToClosedShiftRows(groups);
    for (const base of mapped) {
      const withMeta: ClosedShiftRow = {
        ...base,
        liquidationKey: event.liquidationKey,
        closedAt: event.closedAt.toISOString(),
        rango: formatDateTimeRange(event.periodFrom, event.periodTo),
        periodStart: event.periodFrom.toISOString().slice(0, 10),
        periodEnd: event.periodTo.toISOString().slice(0, 10),
      };
      const expanded = expandShiftRowsForTable([withMeta]);
      for (const row of expanded) {
        rows.push({
          ...row,
          liquidationKey: `${event.liquidationKey}|${row.plataformas}`,
        });
      }
    }
  }

  return rows;
}
