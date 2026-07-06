import { shiftRowKey, type ClosedShiftRow } from "@/features/shifts/ui/cerrar-turnos-types";

/** Server filters by closedAt — ensure `to` covers the closure day. */
function closedShiftQueryDateRange(row: ClosedShiftRow): { from: string; to: string } {
  let to = row.periodEnd;
  if (row.closedAt) {
    const closedDay = row.closedAt.slice(0, 10);
    if (closedDay > to) to = closedDay;
  }
  return { from: row.periodStart, to };
}

export function turnosCerradosHref(row: ClosedShiftRow): string {
  const { from, to } = closedShiftQueryDateRange(row);
  const params = new URLSearchParams({
    shift: shiftRowKey(row),
    from,
    to,
    driver: row.driverId,
  });
  return `/turnos-cerrados?${params.toString()}`;
}

export function appendTurnosCerradosContextParams(
  params: URLSearchParams,
  context?: { shift?: string; driver?: string },
): URLSearchParams {
  if (context?.shift) params.set("shift", context.shift);
  else params.delete("shift");
  if (context?.driver) params.set("driver", context.driver);
  else params.delete("driver");
  return params;
}
