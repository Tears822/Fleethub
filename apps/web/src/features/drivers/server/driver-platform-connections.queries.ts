import "server-only";

import { parseDriverConnectionMetadata } from "@fleethub/auth";
import type { RidePlatform } from "@fleethub/db";
import type { CompanyScope } from "@/features/auth/server/company-scope";
import { driverWhere } from "@/features/auth/server/company-scope";
import {
  connectionDotLabel,
  formatConnectionCheckedAt,
  resolveConnectionDot,
  type ConnectionDot,
} from "@/features/drivers/lib/driver-connection-status";
import {
  computeTurnoAbiertoByDriver,
  endOfLocalDay,
  startOfLocalDay,
} from "@/features/shifts/lib/shift-open-status";
import { withTenant } from "@/infrastructure/database";

export type DriverPlatformConnectionRow = {
  platform: RidePlatform;
  externalDriverId: string | null;
  connectionDot: ConnectionDot;
  connectionLabel: string;
  checkedAt: string | null;
  viajesHoy: number;
};

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function aggregateDriverConnectionDot(
  dots: ConnectionDot[],
  turnoAbierto: boolean,
): ConnectionDot {
  if (turnoAbierto) return "online";
  if (dots.includes("online")) return "online";
  if (dots.length > 0 && dots.every((d) => d === "offline")) return "offline";
  return "unknown";
}

/** One connection dot per driver (best of Uber/FreeNow + turno abierto). */
export async function listDriverConnectionSummaryMap(
  tenantId: string,
  scope: CompanyScope,
): Promise<Map<string, ConnectionDot>> {
  const from = startOfTodayUtc();
  const todayLocalStart = startOfLocalDay(new Date());
  const todayLocalEnd = endOfLocalDay(new Date());

  const [accounts, tripsToday, pendingTrips, liquidationsToday] = await Promise.all([
    withTenant(tenantId, (tx) =>
      tx.driverPlatformAccount.findMany({
        where: {
          tenantId,
          isActive: true,
          platform: { in: ["UBER", "FREENOW"] },
          driver: driverWhere(scope),
        },
        select: { driverId: true, platform: true, metadata: true },
      }),
    ),
    withTenant(tenantId, (tx) =>
      tx.trip.groupBy({
        by: ["driverId", "platform"],
        where: {
          tenantId,
          startedAt: { gte: from },
          driver: driverWhere(scope),
        },
        _count: { _all: true },
      }),
    ),
    withTenant(tenantId, (tx) =>
      tx.trip.findMany({
        where: {
          tenantId,
          liquidationStatus: "pending",
          driver: driverWhere(scope),
        },
        select: { driverId: true, startedAt: true },
      }),
    ),
    withTenant(tenantId, (tx) =>
      tx.shiftLiquidation.findMany({
        where: {
          tenantId,
          status: "active",
          closedAt: { gte: todayLocalStart, lte: todayLocalEnd },
          driver: driverWhere(scope),
        },
        select: { driverId: true, closedAt: true },
      }),
    ),
  ]);

  const viajesKey = (driverId: string, platform: string) => `${driverId}:${platform}`;
  const viajesByKey = new Map(
    tripsToday.map((t) => [viajesKey(t.driverId, t.platform), t._count._all] as const),
  );
  const turnoAbiertoByDriver = computeTurnoAbiertoByDriver(pendingTrips, liquidationsToday);

  const dotsByDriver = new Map<string, ConnectionDot[]>();
  for (const acc of accounts) {
    const viajesHoy = viajesByKey.get(viajesKey(acc.driverId, acc.platform)) ?? 0;
    const dot = resolveConnectionDot({
      viajesHoy,
      platform: acc.platform,
      turnoAbierto: false,
      metadata: acc.metadata,
    });
    const list = dotsByDriver.get(acc.driverId) ?? [];
    list.push(dot);
    dotsByDriver.set(acc.driverId, list);
  }

  const result = new Map<string, ConnectionDot>();
  for (const [driverId, dots] of dotsByDriver) {
    result.set(
      driverId,
      aggregateDriverConnectionDot(dots, turnoAbiertoByDriver.get(driverId) ?? false),
    );
  }
  for (const [driverId, open] of turnoAbiertoByDriver) {
    if (open) result.set(driverId, "online");
  }
  return result;
}

export async function listDriverPlatformConnections(
  tenantId: string,
  driverId: string,
  scope: CompanyScope,
): Promise<DriverPlatformConnectionRow[]> {
  const from = startOfTodayUtc();
  const todayLocalStart = startOfLocalDay(new Date());
  const todayLocalEnd = endOfLocalDay(new Date());

  const [accounts, tripsToday, pendingTrips, liquidationsToday] = await Promise.all([
    withTenant(tenantId, (tx) =>
      tx.driverPlatformAccount.findMany({
        where: {
          tenantId,
          driverId,
          isActive: true,
          platform: { in: ["UBER", "FREENOW", "BOLT", "CABIFY"] },
          driver: driverWhere(scope),
        },
        select: {
          platform: true,
          externalDriverId: true,
          metadata: true,
        },
        orderBy: { platform: "asc" },
      }),
    ),
    withTenant(tenantId, (tx) =>
      tx.trip.groupBy({
        by: ["platform"],
        where: {
          tenantId,
          driverId,
          startedAt: { gte: from },
          driver: driverWhere(scope),
        },
        _count: { _all: true },
      }),
    ),
    withTenant(tenantId, (tx) =>
      tx.trip.findMany({
        where: {
          tenantId,
          driverId,
          liquidationStatus: "pending",
          driver: driverWhere(scope),
        },
        select: { driverId: true, startedAt: true },
      }),
    ),
    withTenant(tenantId, (tx) =>
      tx.shiftLiquidation.findMany({
        where: {
          tenantId,
          driverId,
          status: "active",
          closedAt: { gte: todayLocalStart, lte: todayLocalEnd },
          driver: driverWhere(scope),
        },
        select: { driverId: true, closedAt: true },
      }),
    ),
  ]);

  const viajesByPlatform = new Map(
    tripsToday.map((t) => [t.platform, t._count._all] as const),
  );
  const turnoAbierto =
    computeTurnoAbiertoByDriver(pendingTrips, liquidationsToday).get(driverId) ?? false;

  return accounts.map((a) => {
    const viajesHoy = viajesByPlatform.get(a.platform) ?? 0;
    const connectionDot = resolveConnectionDot({
      viajesHoy,
      platform: a.platform,
      turnoAbierto,
      metadata: a.metadata,
    });
    const meta = parseDriverConnectionMetadata(a.metadata);
    return {
      platform: a.platform,
      externalDriverId: a.externalDriverId,
      connectionDot,
      connectionLabel: connectionDotLabel(connectionDot),
      checkedAt: formatConnectionCheckedAt(meta.connectionCheckedAt),
      viajesHoy,
    };
  });
}
