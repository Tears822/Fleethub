import type { Result } from "@fleethub/contracts";
import { err, ok } from "@fleethub/contracts";
import { RidePlatform, withTenant } from "@fleethub/db";
import { resolveDriverEconomics } from "./company-economic-defaults";
import { fetchPendingShiftTrips } from "./fetch-pending-shift-trips";
import { parseShiftCloseTimeRange } from "./shift-close-filters";
import { computeLiquidationSummary, type LiquidationSummary } from "./shift-liquidation";
import { driverWhere, resolveCompanyScopeForSession, type CompanyScope } from "./tenant-scope";
import type { AppSession } from "./types";

export type LiquidationPreview = LiquidationSummary & {
  driverId: string;
  driverName: string;
  companyName: string;
  tripIds: string[];
  timeRangeApplied: boolean;
};

type PreviewBody = {
  driverId?: string;
  tripIds?: string[];
  platform?: string;
  timeFrom?: string;
  timeTo?: string;
};

export async function previewShiftLiquidation(
  session: AppSession,
  body: unknown,
  options?: { companyScope?: CompanyScope },
): Promise<Result<LiquidationPreview, { message: string }>> {
  if (session.kind !== "tenant" || !session.tid) {
    return err({ message: "No autorizado." });
  }

  const tenantId = session.tid;
  const b = body as PreviewBody;
  const driverId = b.driverId?.trim() ?? "";
  const tripIds = Array.isArray(b.tripIds)
    ? b.tripIds.filter((id): id is string => typeof id === "string")
    : [];
  const platformRaw = b.platform?.trim().toUpperCase();
  const platform =
    platformRaw === RidePlatform.UBER || platformRaw === RidePlatform.FREENOW
      ? platformRaw
      : undefined;

  if (!driverId && tripIds.length === 0) {
    return err({ message: "Indica el conductor o los viajes." });
  }

  const rangeResult = parseShiftCloseTimeRange(b);
  if (!rangeResult.ok) return rangeResult;
  const timeRange = rangeResult.value;

  const scope =
    options?.companyScope ??
    (await resolveCompanyScopeForSession({
      ...session,
      kind: "tenant",
      tid: tenantId,
    }));

  return withTenant(tenantId, async (tx) => {
    const trips = await fetchPendingShiftTrips(tx, {
      tenantId,
      scope,
      driverId,
      tripIds,
      platform,
      timeRange,
    });

    if (trips.length === 0) {
      return err({
        message: timeRange
          ? "No hay viajes pendientes en la franja horaria indicada."
          : "No hay viajes pendientes para liquidar.",
      });
    }

    const driverRow = await tx.driver.findFirst({
      where: { id: trips[0]!.driverId, tenantId, ...driverWhere(scope) },
      select: {
        id: true,
        fullName: true,
        driverSharePct: true,
        driverBonusSharePct: true,
        driverPlatformFeeSharePct: true,
        dailyFixedCents: true,
        company: { select: { legalName: true, profile: true } },
      },
    });
    if (!driverRow) {
      return err({ message: "Conductor no encontrado." });
    }

    const economics = resolveDriverEconomics(driverRow, driverRow.company.profile);
    const summary = computeLiquidationSummary(trips, economics);

    return ok({
      ...summary,
      driverId: driverRow.id,
      driverName: driverRow.fullName,
      companyName: driverRow.company.legalName,
      tripIds: trips.map((t) => t.id),
      timeRangeApplied: Boolean(timeRange),
    });
  });
}
