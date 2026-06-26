import type { Result } from "@fleethub/contracts";
import { err, ok } from "@fleethub/contracts";
import { withTenant } from "@fleethub/db";
import { driverWhere, resolveCompanyScopeForSession, type CompanyScope } from "./tenant-scope";
import type { AppSession } from "./types";

/** One row in Turnos cerrados = one liquidación persistida (o fallback audit/legacy). */
export type ClosedLiquidationEvent = {
  liquidationKey: string;
  closedAt: Date;
  driverId: string;
  driverName: string;
  tripIds: string[];
  periodFrom: Date;
  periodTo: Date;
};

type ShiftClosePayload = {
  tripIds?: unknown;
  timeRange?: { from?: string; to?: string };
};

function parseTripIds(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const raw = (payload as ShiftClosePayload).tripIds;
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === "string" && id.length > 0);
}

function parseTimeRange(payload: unknown): { from?: Date; to?: Date } {
  if (!payload || typeof payload !== "object") return {};
  const tr = (payload as ShiftClosePayload).timeRange;
  if (!tr || typeof tr !== "object") return {};
  const from = typeof tr.from === "string" ? new Date(tr.from) : undefined;
  const to = typeof tr.to === "string" ? new Date(tr.to) : undefined;
  return {
    from: from && !Number.isNaN(from.getTime()) ? from : undefined,
    to: to && !Number.isNaN(to.getTime()) ? to : undefined,
  };
}

function dayKeyUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function legacyBucketKey(driverId: string, dayKey: string): string {
  return `legacy:${driverId}:${dayKey}`;
}

/**
 * Lists liquidation events from `shift_liquidations`, with audit/legacy fallbacks
 * for data created before the table existed.
 */
export async function listClosedLiquidationEventsForTenant(
  tenantId: string,
  scope: CompanyScope,
  options?: { dateFrom?: Date; dateTo?: Date },
): Promise<ClosedLiquidationEvent[]> {
  const dateFrom = options?.dateFrom;
  const dateTo = options?.dateTo;

  return withTenant(tenantId, async (tx) => {
    const [liquidations, closeLogs, closedTrips] = await Promise.all([
      tx.shiftLiquidation.findMany({
        where: {
          tenantId,
          status: "active",
          driver: driverWhere(scope),
          ...(dateFrom || dateTo
            ? {
                closedAt: {
                  ...(dateFrom ? { gte: dateFrom } : {}),
                  ...(dateTo ? { lte: dateTo } : {}),
                },
              }
            : {}),
        },
        orderBy: { closedAt: "desc" },
        select: {
          id: true,
          closedAt: true,
          driverId: true,
          periodFrom: true,
          periodTo: true,
          tripIds: true,
          driver: { select: { fullName: true } },
        },
      }),
      tx.auditLog.findMany({
        where: { tenantId, action: "shift.close" },
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true, entityId: true, payload: true },
      }),
      tx.trip.findMany({
        where: {
          tenantId,
          liquidationStatus: "closed",
          driver: driverWhere(scope),
        },
        select: {
          id: true,
          driverId: true,
          startedAt: true,
          endedAt: true,
          driver: { select: { fullName: true } },
        },
      }),
    ]);

    const closedById = new Map(closedTrips.map((t) => [t.id, t]));
    const claimedTripIds = new Set<string>();
    const events: ClosedLiquidationEvent[] = [];

    for (const liq of liquidations) {
      const stillClosed = liq.tripIds.filter((id) => closedById.has(id));
      if (stillClosed.length === 0) continue;

      for (const id of stillClosed) claimedTripIds.add(id);

      events.push({
        liquidationKey: `liq:${liq.id}`,
        closedAt: liq.closedAt,
        driverId: liq.driverId,
        driverName: liq.driver.fullName,
        tripIds: stillClosed,
        periodFrom: liq.periodFrom,
        periodTo: liq.periodTo,
      });
    }

    for (const log of closeLogs) {
      const closedAt = log.createdAt;
      if (dateFrom && closedAt < dateFrom) continue;
      if (dateTo && closedAt > dateTo) continue;

      const payloadTripIds = parseTripIds(log.payload);
      const stillClosed = payloadTripIds.filter(
        (id) => closedById.has(id) && !claimedTripIds.has(id),
      );
      if (stillClosed.length === 0) continue;

      for (const id of stillClosed) claimedTripIds.add(id);

      const trips = stillClosed.map((id) => closedById.get(id)!);
      let periodFrom = trips[0]!.startedAt;
      let periodTo = trips[0]!.endedAt ?? trips[0]!.startedAt;
      for (const t of trips) {
        const end = t.endedAt ?? t.startedAt;
        if (t.startedAt < periodFrom) periodFrom = t.startedAt;
        if (end > periodTo) periodTo = end;
      }

      const tr = parseTimeRange(log.payload);
      if (tr.from) periodFrom = tr.from;
      if (tr.to) periodTo = tr.to;

      const driverId =
        trips[0]?.driverId ?? (typeof log.entityId === "string" ? log.entityId : "");
      if (!driverId) continue;

      events.push({
        liquidationKey: `audit:${log.id.toString()}`,
        closedAt,
        driverId,
        driverName: trips[0]?.driver.fullName ?? "",
        tripIds: stillClosed,
        periodFrom,
        periodTo,
      });
    }

    const legacyBuckets = new Map<
      string,
      {
        driverId: string;
        driverName: string;
        tripIds: string[];
        min: Date;
        max: Date;
        dayKey: string;
      }
    >();

    for (const t of closedTrips) {
      if (claimedTripIds.has(t.id)) continue;
      const end = t.endedAt ?? t.startedAt;
      const dk = dayKeyUtc(t.startedAt);
      const key = `${t.driverId}:${dk}`;
      let b = legacyBuckets.get(key);
      if (!b) {
        b = {
          driverId: t.driverId,
          driverName: t.driver.fullName,
          tripIds: [],
          min: t.startedAt,
          max: end,
          dayKey: dk,
        };
        legacyBuckets.set(key, b);
      }
      b.tripIds.push(t.id);
      if (t.startedAt < b.min) b.min = t.startedAt;
      if (end > b.max) b.max = end;
    }

    for (const b of legacyBuckets.values()) {
      const closedAt = b.max;
      if (dateFrom && closedAt < dateFrom) continue;
      if (dateTo && closedAt > dateTo) continue;

      events.push({
        liquidationKey: legacyBucketKey(b.driverId, b.dayKey),
        closedAt,
        driverId: b.driverId,
        driverName: b.driverName,
        tripIds: b.tripIds,
        periodFrom: b.min,
        periodTo: b.max,
      });
    }

    events.sort((a, b) => b.closedAt.getTime() - a.closedAt.getTime());

    return events;
  });
}

export async function listClosedLiquidationEvents(
  session: AppSession,
  options?: { dateFrom?: Date; dateTo?: Date },
): Promise<Result<ClosedLiquidationEvent[], { message: string }>> {
  if (session.kind !== "tenant" || !session.tid) {
    return err({ message: "No autorizado." });
  }

  const scope = await resolveCompanyScopeForSession({
    ...session,
    kind: "tenant",
    tid: session.tid,
  });

  const events = await listClosedLiquidationEventsForTenant(session.tid, scope, options);
  return ok(events);
}
