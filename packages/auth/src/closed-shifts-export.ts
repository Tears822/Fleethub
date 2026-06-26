import type { Result } from "@fleethub/contracts";
import { err, ok } from "@fleethub/contracts";
import { listClosedLiquidationEvents } from "./closed-liquidation-events";
import type { AppSession } from "./types";

export type ClosedLiquidationPdfGroup = {
  driverId: string;
  driverName: string;
  tripIds: string[];
  dayKey: string;
  rangeLabel: string;
};

const MAX_GROUPS = 80;

function formatRangeLabel(from: Date, to: Date): string {
  const fmt = new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const a = fmt.format(from);
  const b = fmt.format(to);
  return a === b ? a : `${a} – ${b}`;
}

export async function listClosedLiquidationPdfGroups(
  session: AppSession,
  options?: { dateFrom?: Date; dateTo?: Date },
): Promise<Result<ClosedLiquidationPdfGroup[], { message: string }>> {
  const eventsResult = await listClosedLiquidationEvents(session, options);
  if (!eventsResult.ok) return eventsResult;

  const events = eventsResult.value;
  if (events.length === 0) {
    return err({ message: "No hay turnos cerrados en el periodo indicado." });
  }

  const groups: ClosedLiquidationPdfGroup[] = events.slice(0, MAX_GROUPS).map((e) => ({
    driverId: e.driverId,
    driverName: e.driverName,
    tripIds: e.tripIds,
    dayKey: e.closedAt.toISOString().slice(0, 10),
    rangeLabel: formatRangeLabel(e.periodFrom, e.periodTo),
  }));

  if (groups.length === 0) {
    return err({ message: "No hay turnos cerrados para exportar." });
  }

  return ok(groups);
}
