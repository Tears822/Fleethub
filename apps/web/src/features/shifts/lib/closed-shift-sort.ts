import type { ClosedShiftRow } from "@/features/shifts/ui/cerrar-turnos-types";
import { isoToDateEs } from "@/shared/lib/date-es";
import { formatDateTimeShortInTenantTz } from "@/shared/lib/tenant-timezone";

/** Timestamp for sorting closed shifts: closure time, else end of shift period. */
export function closedShiftSortTimestamp(row: ClosedShiftRow): number {
  if (row.closedAt) {
    const t = Date.parse(row.closedAt);
    if (!Number.isNaN(t)) return t;
  }
  if (row.periodEnd) {
    const t = Date.parse(`${row.periodEnd}T23:59:59.999`);
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

export function formatClosedShiftDateCell(row: ClosedShiftRow): string {
  if (row.closedAt) return formatDateTimeShortInTenantTz(row.closedAt);
  return isoToDateEs(row.periodEnd) ?? "—";
}
