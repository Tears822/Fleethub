import type { Result } from "@fleethub/contracts";
import { err, ok } from "@fleethub/contracts";
import { RidePlatform, withTenant } from "@fleethub/db";
import { resolveShiftActivity, type ShiftActivityDto } from "./shift-activity";
import { driverWhere, resolveCompanyScopeForSession, type CompanyScope } from "./tenant-scope";
import { driverIdMatchesScope } from "./company-scope-cookie";
import type { AppSession } from "./types";

export type ShiftTripDetailDto = {
  id: string;
  platform: RidePlatform;
  startedAt: string;
  endedAt: string | null;
  fareType: string | null;
  paymentMethod: string | null;
  cashPaymentCents: string | null;
  cardPaymentCents: string | null;
  appPaymentCents: string | null;
  grossAmountCents: string | null;
  platformFeeCents: string | null;
  tipCents: string | null;
  platformBonusCents: string | null;
  tollCents: string | null;
  netAmountCents: string | null;
  paymentValidated: boolean;
};

type ListShiftTripsQuery = {
  driverId?: string;
  tripIds?: string[];
  liquidationStatus?: string;
  platform?: string;
  /** When false, skip activity resolution (faster for close-shift picker). */
  includeActivity?: boolean;
};

type TripActivitySlice = {
  startedAt: Date;
  endedAt: Date | null;
  grossAmountCents: bigint | null;
  netAmountCents: bigint | null;
};

export type ShiftActivityResolveContext = {
  tenantId: string;
  driverId: string;
  platform: RidePlatform;
  trips: TripActivitySlice[];
  tripDays: Date[];
};

export type ListShiftTripsOptions = {
  /** After trips load, before resolving activity (e.g. FreeNow offer backfill). */
  beforeResolveActivity?: (ctx: ShiftActivityResolveContext) => Promise<void>;
  /** Shell company selector (must match Cerrar turnos table scope). */
  companyScope?: CompanyScope;
};

function centsToString(value: bigint | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value.toString();
}

export async function listShiftTripsForDetail(
  session: AppSession,
  query: ListShiftTripsQuery,
  options?: ListShiftTripsOptions,
): Promise<Result<{ trips: ShiftTripDetailDto[]; activity: ShiftActivityDto | null }, { message: string }>> {
  if (session.kind !== "tenant" || !session.tid) {
    return err({ message: "No autorizado." });
  }

  const tenantId = session.tid;
  const driverId = query.driverId?.trim() ?? "";
  const tripIds = Array.isArray(query.tripIds)
    ? query.tripIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  const status = query.liquidationStatus?.trim() || undefined;

  const MAX_TRIP_IDS_IN_QUERY = 80;
  const effectiveTripIds =
    driverId && status === "pending" && tripIds.length > MAX_TRIP_IDS_IN_QUERY
      ? []
      : tripIds;

  if (!driverId && effectiveTripIds.length === 0) {
    return err({ message: "Indica el conductor o los viajes." });
  }

  const scope =
    options?.companyScope ??
    (await resolveCompanyScopeForSession({
      ...session,
      kind: "tenant",
      tid: tenantId,
    }));

  const platformParam = query.platform?.trim().toUpperCase();
  const platformFilter =
    platformParam && platformParam in RidePlatform
      ? (platformParam as RidePlatform)
      : undefined;

  const includeActivity = query.includeActivity !== false;

  const trips = await withTenant(tenantId, async (tx) =>
    tx.trip.findMany({
      where: {
        tenantId,
        ...(status ? { liquidationStatus: status } : {}),
        ...(effectiveTripIds.length > 0 ? { id: { in: effectiveTripIds } } : {}),
        ...(driverId ? { driverId } : {}),
        ...(platformFilter ? { platform: platformFilter } : {}),
        driver: driverWhere(scope),
      },
      orderBy: { startedAt: "asc" },
      select: {
        id: true,
        driverId: true,
        platform: true,
        startedAt: true,
        endedAt: true,
        fareType: true,
        paymentMethod: true,
        cashPaymentCents: true,
        cardPaymentCents: true,
        appPaymentCents: true,
        grossAmountCents: true,
        platformFeeCents: true,
        tipCents: true,
        platformBonusCents: true,
        tollCents: true,
        netAmountCents: true,
        paymentValidated: true,
      },
    }),
  );

  if (driverId && trips.length === 0) {
    const driverRow = await withTenant(tenantId, (tx) =>
      tx.driver.findFirst({
        where: { id: driverId, tenantId },
        select: { companyId: true },
      }),
    );
    if (driverRow && !driverIdMatchesScope(driverRow, scope)) {
      return err({ message: "No autorizado para ver datos de este conductor." });
    }
  }

  const resolvedDriverId = driverId || trips[0]?.driverId;
  const platform = platformFilter ?? trips[0]?.platform;

  if (
    includeActivity &&
    resolvedDriverId &&
    platform &&
    trips.length > 0 &&
    options?.beforeResolveActivity
  ) {
    const tripSlices = trips.map((t) => ({
      startedAt: t.startedAt,
      endedAt: t.endedAt,
      grossAmountCents: t.grossAmountCents,
      netAmountCents: t.netAmountCents,
    }));
    try {
      await options.beforeResolveActivity({
        tenantId,
        driverId: resolvedDriverId,
        platform,
        trips: tripSlices,
        tripDays: trips.map((t) => t.startedAt),
      });
    } catch {
      // Optional enrichment — never block trip list.
    }
  }

  let activity: ShiftActivityDto | null = null;
  if (includeActivity && resolvedDriverId && platform && trips.length > 0) {
    try {
      activity = await resolveShiftActivity(
        tenantId,
        resolvedDriverId,
        platform,
        trips,
        { forceTripEstimate: effectiveTripIds.length > 0 },
      );
    } catch {
      activity = null;
    }
  }

  return ok({
    trips: trips.map((t) => ({
      id: t.id,
      platform: t.platform,
      startedAt: t.startedAt.toISOString(),
      endedAt: t.endedAt?.toISOString() ?? null,
      fareType: t.fareType,
      paymentMethod: t.paymentMethod,
      cashPaymentCents: centsToString(t.cashPaymentCents),
      cardPaymentCents: centsToString(t.cardPaymentCents),
      appPaymentCents: centsToString(t.appPaymentCents),
      grossAmountCents: centsToString(t.grossAmountCents),
      platformFeeCents: centsToString(t.platformFeeCents),
      tipCents: centsToString(t.tipCents),
      platformBonusCents: centsToString(t.platformBonusCents),
      tollCents: centsToString(t.tollCents),
      netAmountCents: centsToString(t.netAmountCents),
      paymentValidated: t.paymentValidated,
    })),
    activity,
  });
}
