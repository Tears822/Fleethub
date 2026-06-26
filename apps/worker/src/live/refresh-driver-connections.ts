import {
  classifyUberDriverStatus,
  connectionMetadataIsFresh,
  parseDriverConnectionMetadata,
  type DriverConnectionState,
} from "@fleethub/auth";
import { withTenant } from "@fleethub/db";
import {
  listAllUberDriverRealtimeStatuses,
  resolveUberOrgId,
} from "../lib/uber-fleet-client.js";
import { resolveTenantUberOrgId } from "../lib/tenant-platform-config.js";
import { uberFleetEnvReady } from "../lib/uber-fleet-env.js";

const REFRESH_STALE_MS = 5 * 60 * 1000;
const CONNECTED_WINDOW_MS = 2 * 60 * 60 * 1000;
const ACTIVE_TRIP_END_GRACE_MS = 30 * 60 * 1000;

function nowIso(): string {
  return new Date().toISOString();
}

async function tenantNeedsUberRefresh(tenantId: string): Promise<boolean> {
  const dpas = await withTenant(tenantId, (tx) =>
    tx.driverPlatformAccount.findMany({
      where: { tenantId, platform: "UBER", isActive: true },
      select: { metadata: true },
    }),
  );
  if (dpas.length === 0) return false;
  return dpas.some((d) => !connectionMetadataIsFresh(parseDriverConnectionMetadata(d.metadata), REFRESH_STALE_MS));
}

async function patchDpaMetadata(
  tenantId: string,
  dpaId: string,
  existing: unknown,
  state: DriverConnectionState,
  source: "uber_api" | "trip_activity",
): Promise<void> {
  await withTenant(tenantId, (tx) =>
    tx.driverPlatformAccount.update({
      where: { id: dpaId },
      data: {
        metadata: {
          ...(typeof existing === "object" && existing
            ? (existing as Record<string, unknown>)
            : {}),
          connectionState: state,
          connectionCheckedAt: nowIso(),
          connectionSource: source,
        },
      },
    }),
  );
}

async function refreshUberConnections(tenantId: string): Promise<number> {
  const ready = uberFleetEnvReady();
  if (!ready.ok) return 0;

  const orgOverride = await resolveTenantUberOrgId(tenantId);
  const org = await resolveUberOrgId(orgOverride);
  if (!org.ok) {
    console.warn("[live] uber connections:", org.message);
    return 0;
  }

  const statuses = await listAllUberDriverRealtimeStatuses(org.data);
  if (!statuses.ok) {
    console.warn("[live] uber realtime status:", statuses.message);
    return 0;
  }

  const since = new Date(Date.now() - CONNECTED_WINDOW_MS);
  const graceEnd = Date.now() - ACTIVE_TRIP_END_GRACE_MS;

  const [dpas, uberTrips] = await Promise.all([
    withTenant(tenantId, (tx) =>
      tx.driverPlatformAccount.findMany({
        where: { tenantId, platform: "UBER", isActive: true },
        select: { id: true, driverId: true, externalDriverId: true, metadata: true },
      }),
    ),
    withTenant(tenantId, (tx) =>
      tx.trip.findMany({
        where: { tenantId, platform: "UBER", startedAt: { gte: since } },
        select: { driverId: true, startedAt: true, endedAt: true },
      }),
    ),
  ]);

  const onlineFromTrips = new Set<string>();
  for (const t of uberTrips) {
    const endMs = t.endedAt?.getTime() ?? Date.now();
    if (t.startedAt.getTime() >= since.getTime() && endMs >= graceEnd) {
      onlineFromTrips.add(t.driverId);
    }
  }

  let updated = 0;
  for (const dpa of dpas) {
    const ext = dpa.externalDriverId.trim();
    if (!ext || ext.startsWith("seed-")) continue;
    const apiStatus = statuses.data.get(ext);
    let state = classifyUberDriverStatus(apiStatus);
    let source: "uber_api" | "trip_activity" = "uber_api";
    if (state === "unknown" && onlineFromTrips.has(dpa.driverId)) {
      state = "online";
      source = "trip_activity";
    } else if (!apiStatus) {
      source = "trip_activity";
    }
    await patchDpaMetadata(tenantId, dpa.id, dpa.metadata, state, source);
    updated += 1;
  }
  return updated;
}

/** FreeNow has no live status API — mark online when a trip started in the last 2h is still open or ended recently. */
async function refreshFreenowConnectionsFromTrips(tenantId: string): Promise<number> {
  const since = new Date(Date.now() - CONNECTED_WINDOW_MS);
  const graceEnd = Date.now() - ACTIVE_TRIP_END_GRACE_MS;

  const [dpas, trips] = await Promise.all([
    withTenant(tenantId, (tx) =>
      tx.driverPlatformAccount.findMany({
        where: { tenantId, platform: "FREENOW", isActive: true },
        select: { id: true, driverId: true, externalDriverId: true, metadata: true },
      }),
    ),
    withTenant(tenantId, (tx) =>
      tx.trip.findMany({
        where: {
          tenantId,
          platform: "FREENOW",
          startedAt: { gte: since },
        },
        select: {
          driverId: true,
          startedAt: true,
          endedAt: true,
        },
      }),
    ),
  ]);

  const onlineDriverIds = new Set<string>();
  for (const t of trips) {
    const endMs = t.endedAt?.getTime() ?? Date.now();
    if (t.startedAt.getTime() >= since.getTime() && endMs >= graceEnd) {
      onlineDriverIds.add(t.driverId);
    }
  }

  let updated = 0;
  for (const dpa of dpas) {
    const ext = dpa.externalDriverId.trim();
    if (!ext || ext.startsWith("seed-")) continue;
    const state: DriverConnectionState = onlineDriverIds.has(dpa.driverId) ? "online" : "offline";
    await patchDpaMetadata(tenantId, dpa.id, dpa.metadata, state, "trip_activity");
    updated += 1;
  }
  return updated;
}

/** Refresh Uber (API) + FreeNow (trip window) connection snapshots for a tenant. */
export async function refreshDriverConnectionsForTenant(
  tenantId: string,
  options?: { force?: boolean },
): Promise<{ uberUpdated: number; freenowUpdated: number; skipped: boolean }> {
  const force = options?.force === true;
  let uberUpdated = 0;

  if (force || (await tenantNeedsUberRefresh(tenantId))) {
    uberUpdated = await refreshUberConnections(tenantId);
  }

  const freenowUpdated = await refreshFreenowConnectionsFromTrips(tenantId);

  return {
    uberUpdated,
    freenowUpdated,
    skipped: !force && uberUpdated === 0 && freenowUpdated === 0,
  };
}
