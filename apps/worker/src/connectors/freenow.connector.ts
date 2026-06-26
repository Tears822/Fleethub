import type {
  ConnectionResult,
  DriverDayMetrics,
  FleetConnector,
  NormalizedTripUpsert,
} from "@fleethub/contracts";
import {
  computeDayMetricsFromTripSlices,
  connectionMetadataIsFresh,
  parseDriverConnectionMetadata,
} from "@fleethub/auth";
import { withTenant } from "@fleethub/db";
import { probeFreenowApi } from "../lib/freenow-client.js";
import { freenowEnvReady } from "../lib/freenow-env.js";
import { resolveFreenowPublicCompanyIdForDriver } from "../lib/freenow-company-map.js";
import {
  resolveTenantFreenowPublicCompanyId,
  resolveTenantFreenowSyncDays,
} from "../lib/tenant-platform-config.js";
import { freenowSyncRange } from "../lib/freenow-sync-window.js";
import { syncFreenowTripsForDriverEnriched } from "../lib/freenow-sync-trips.js";

const CONNECTION_STALE_MS = 5 * 60 * 1000;
const CONNECTED_WINDOW_MS = 2 * 60 * 60 * 1000;
const ACTIVE_TRIP_END_GRACE_MS = 30 * 60 * 1000;

function pick(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v : undefined;
}

function stubTrips(): NormalizedTripUpsert[] {
  const now = new Date();
  const id = `stub-freenow-${now.getTime()}`;
  return [
    {
      externalTripId: id,
      startedAt: now.toISOString(),
      endedAt: now.toISOString(),
      grossAmountCents: 900n,
      platformFeeCents: 150n,
      tipCents: 50n,
      tollCents: 0n,
      netAmountCents: 700n,
      paymentMethod: "card",
      paymentValidated: false,
      fareType: "Taximetro",
      platformBonusCents: BigInt(0),
    },
  ];
}

async function freenowConnectionFromTrips(
  tenantId: string,
  driverId: string,
): Promise<"online" | "offline" | "unknown"> {
  const since = new Date(Date.now() - CONNECTED_WINDOW_MS);
  const graceEnd = Date.now() - ACTIVE_TRIP_END_GRACE_MS;

  const trips = await withTenant(tenantId, (tx) =>
    tx.trip.findMany({
      where: {
        tenantId,
        driverId,
        platform: "FREENOW",
        startedAt: { gte: since },
      },
      select: { startedAt: true, endedAt: true },
    }),
  );

  for (const t of trips) {
    const endMs = t.endedAt?.getTime() ?? Date.now();
    if (t.startedAt.getTime() >= since.getTime() && endMs >= graceEnd) {
      return "online";
    }
  }
  return trips.length > 0 ? "offline" : "unknown";
}

export const freeNowConnector: FleetConnector = {
  platform: "FREENOW",

  async verifyConnection(_tenantId: string, _credentialsRef: string): Promise<ConnectionResult> {
    const ready = freenowEnvReady();
    if (!ready.ok) {
      return { ok: false, message: `Missing ${ready.missing.join(", ")}` };
    }
    const probe = await probeFreenowApi();
    if (!probe.ok) {
      return { ok: false, message: probe.message };
    }
    return { ok: true };
  },

  async syncTrips(params: {
    tenantId: string;
    driverPlatformAccountId: string;
    from: Date;
    to: Date;
  }): Promise<NormalizedTripUpsert[]> {
    const stub = pick("FLEETHUB_SYNC_STUB_TRIPS");
    if (stub === "1" || stub?.toLowerCase() === "true") {
      return stubTrips();
    }

    const dpa = await withTenant(params.tenantId, (tx) =>
      tx.driverPlatformAccount.findUnique({
        where: { id: params.driverPlatformAccountId },
        select: { externalDriverId: true, driverId: true, metadata: true },
      }),
    );
    const publicCompanyId = dpa
      ? await resolveFreenowPublicCompanyIdForDriver(
          params.tenantId,
          dpa.driverId,
          dpa.metadata,
        )
      : await resolveTenantFreenowPublicCompanyId(params.tenantId);
    const publicDriverId = dpa?.externalDriverId?.trim();
    if (!publicDriverId || publicDriverId.startsWith("seed-") || publicDriverId.startsWith("manual-")) {
      return [];
    }

    const syncDays = await resolveTenantFreenowSyncDays(params.tenantId);
    const range = freenowSyncRange(params.to, syncDays);
    const from = params.from < range.from ? params.from : range.from;
    const to = params.to > range.to ? params.to : range.to;

    const synced = await syncFreenowTripsForDriverEnriched({
      publicCompanyId,
      publicDriverId,
      from,
      to,
    });
    if (!synced.ok) {
      throw new Error(synced.message);
    }
    return synced.trips;
  },

  async syncDriverDayMetrics(params: {
    tenantId: string;
    driverPlatformAccountId: string;
    date: Date;
  }): Promise<DriverDayMetrics> {
    const dayStart = new Date(
      Date.UTC(
        params.date.getUTCFullYear(),
        params.date.getUTCMonth(),
        params.date.getUTCDate(),
      ),
    );
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const trips = await withTenant(params.tenantId, (tx) =>
      tx.trip.findMany({
        where: {
          driverPlatformAccountId: params.driverPlatformAccountId,
          platform: "FREENOW",
          startedAt: { gte: dayStart, lt: dayEnd },
        },
        select: { startedAt: true, endedAt: true },
      }),
    );

    return computeDayMetricsFromTripSlices(trips);
  },

  async getDriverConnectionState(params: {
    tenantId: string;
    driverPlatformAccountId: string;
  }): Promise<"online" | "offline" | "unknown"> {
    const dpa = await withTenant(params.tenantId, (tx) =>
      tx.driverPlatformAccount.findFirst({
        where: { id: params.driverPlatformAccountId, platform: "FREENOW" },
        select: { driverId: true, metadata: true },
      }),
    );
    if (!dpa) return "unknown";

    const meta = parseDriverConnectionMetadata(dpa.metadata);
    if (connectionMetadataIsFresh(meta, CONNECTION_STALE_MS)) {
      if (meta.connectionState === "online") return "online";
      if (meta.connectionState === "offline") return "offline";
    }

    return freenowConnectionFromTrips(params.tenantId, dpa.driverId);
  },
};
