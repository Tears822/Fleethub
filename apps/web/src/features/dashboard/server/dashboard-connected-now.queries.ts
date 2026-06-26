/**
 * FRD §5 — conductores conectados ahora (Uber API + actividad FreeNow).
 */
import "server-only";

import type { CompanyScope } from "@/features/auth/server/company-scope";
import { driverWhere } from "@/features/auth/server/company-scope";
import {
  connectionMetadataIsFresh,
  parseDriverConnectionMetadata,
} from "@fleethub/auth";
import { withTenant } from "@/infrastructure/database";

const METADATA_FRESH_MS = 15 * 60 * 1000;
const TRIP_ACTIVITY_MS = 2 * 60 * 60 * 1000;
const TRIP_END_GRACE_MS = 30 * 60 * 1000;

export type ConnectedNowSnapshot = {
  count: number;
  hint: string;
  source: "api" | "mixed" | "trips" | "none";
};

export async function countDriversConnectedNow(
  tenantId: string,
  scope: CompanyScope,
): Promise<ConnectedNowSnapshot> {
  const since = new Date(Date.now() - TRIP_ACTIVITY_MS);
  const graceEnd = Date.now() - TRIP_END_GRACE_MS;

  const [dpas, recentTrips] = await Promise.all([
    withTenant(tenantId, (tx) =>
      tx.driverPlatformAccount.findMany({
        where: {
          tenantId,
          isActive: true,
          platform: { in: ["UBER", "FREENOW"] },
          driver: driverWhere(scope),
        },
        select: {
          driverId: true,
          platform: true,
          metadata: true,
        },
      }),
    ),
    withTenant(tenantId, (tx) =>
      tx.trip.findMany({
        where: {
          tenantId,
          platform: { in: ["UBER", "FREENOW"] },
          startedAt: { gte: since },
          driver: driverWhere(scope),
        },
        select: { driverId: true, startedAt: true, endedAt: true },
      }),
    ),
  ]);

  const onlineFromMeta = new Set<string>();
  let hasFreshUber = false;
  let hasFreshFreenow = false;

  for (const dpa of dpas) {
    const meta = parseDriverConnectionMetadata(dpa.metadata);
    if (meta.connectionState !== "online") continue;
    if (!connectionMetadataIsFresh(meta, METADATA_FRESH_MS)) continue;
    onlineFromMeta.add(dpa.driverId);
    if (dpa.platform === "UBER") hasFreshUber = true;
    if (dpa.platform === "FREENOW") hasFreshFreenow = true;
  }

  const onlineFromTrips = new Set<string>();
  for (const t of recentTrips) {
    const endMs = t.endedAt?.getTime() ?? Date.now();
    if (t.startedAt.getTime() >= since.getTime() && endMs >= graceEnd) {
      onlineFromTrips.add(t.driverId);
    }
  }

  const combined = new Set([...onlineFromMeta, ...onlineFromTrips]);

  let source: ConnectedNowSnapshot["source"] = "none";
  if (hasFreshUber && hasFreshFreenow) source = "mixed";
  else if (hasFreshUber) source = "api";
  else if (hasFreshFreenow || onlineFromTrips.size > 0) source = "trips";

  const hint =
    source === "api"
      ? "Uber en línea (API) · ventana 2 h"
      : source === "mixed"
        ? "Uber API + actividad FreeNow · 2 h"
        : source === "trips"
          ? "actividad de viajes · últimas 2 h"
          : "sincroniza Uber/FreeNow para estado en vivo";

  return { count: combined.size, hint, source };
}
