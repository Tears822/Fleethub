import type { Result } from "@fleethub/contracts";
import { err, ok } from "@fleethub/contracts";

export type ShiftCloseTimeRange = {
  timeFrom: Date;
  timeTo: Date;
};

export function parseShiftCloseTimeRange(body: {
  timeFrom?: string;
  timeTo?: string;
}): Result<ShiftCloseTimeRange | undefined, { message: string }> {
  const fromRaw = body.timeFrom?.trim();
  const toRaw = body.timeTo?.trim();
  if (!fromRaw && !toRaw) return ok(undefined);
  if (!fromRaw || !toRaw) {
    return err({ message: "Indica inicio y fin de la franja horaria." });
  }
  const timeFrom = new Date(fromRaw);
  const timeTo = new Date(toRaw);
  if (Number.isNaN(timeFrom.getTime()) || Number.isNaN(timeTo.getTime())) {
    return err({ message: "Franja horaria no válida." });
  }
  if (timeFrom.getTime() > timeTo.getTime()) {
    return err({ message: "La hora de inicio debe ser anterior al fin." });
  }
  return ok({ timeFrom, timeTo });
}

export function tripOverlapsTimeRange(
  startedAt: Date,
  endedAt: Date | null,
  range: ShiftCloseTimeRange,
): boolean {
  const tripEnd = endedAt ?? startedAt;
  return startedAt.getTime() <= range.timeTo.getTime() && tripEnd.getTime() >= range.timeFrom.getTime();
}

export function filterTripsByTimeRange<
  T extends { startedAt: Date; endedAt: Date | null },
>(trips: T[], range?: ShiftCloseTimeRange): T[] {
  if (!range) return trips;
  return trips.filter((t) => tripOverlapsTimeRange(t.startedAt, t.endedAt, range));
}
