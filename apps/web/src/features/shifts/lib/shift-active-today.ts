/**
 * Dashboard KPI «Conductores activos hoy» — turno con inicio hoy (spec Pantalla 1).
 */
export type ShiftPeriodToday = { driverId: string; periodFrom: Date };

export function countDriversActiveToday(input: {
  shiftPeriodsToday: ShiftPeriodToday[];
  tripDriverIdsToday: Iterable<string>;
}): number {
  const ids = new Set<string>();
  for (const row of input.shiftPeriodsToday) {
    ids.add(row.driverId);
  }
  for (const driverId of input.tripDriverIdsToday) {
    ids.add(driverId);
  }
  return ids.size;
}
