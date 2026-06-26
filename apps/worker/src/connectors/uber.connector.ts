import type {
  ConnectionResult,
  DriverDayMetrics,
  FleetConnector,
  NormalizedTripUpsert,
} from "@fleethub/contracts";
import { classifyUberDriverStatus, computeDayMetricsFromTripSlices } from "@fleethub/auth";
import { withTenant } from "@fleethub/db";
import {
  fetchUberDriverPayments,
  getUberFleetAccessToken,
  listUberDrivers,
  probeUberFleetApi,
  resolveUberOrgId,
  uberDriverExternalId,
} from "../lib/uber-fleet-client.js";
import { uberFleetEnvReady } from "../lib/uber-fleet-env.js";
import { mergeUberDriverTripUpserts } from "../lib/uber-driver-mappers.js";
import { uberPaymentsToTripUpserts } from "../lib/uber-payments-mapper.js";
import { syncUberTripsViaDriverApi } from "../lib/uber-driver-sync.js";
import { resolveUberDriverAccessToken } from "../lib/uber-driver-client.js";
import { syncUberTripsViaReports } from "../lib/uber-reports.js";
import { fetchUberDriverDayMetrics } from "../lib/uber-analytics-metrics.js";
import { resolveTenantUberOrgId } from "../lib/tenant-platform-config.js";

function pick(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v : undefined;
}

function stubTrips(): NormalizedTripUpsert[] {
  const now = new Date();
  const id = `stub-uber-${now.getTime()}`;
  return [
    {
      externalTripId: id,
      startedAt: now.toISOString(),
      endedAt: now.toISOString(),
      grossAmountCents: 1234n,
      platformFeeCents: 200n,
      tipCents: 0n,
      tollCents: 0n,
      netAmountCents: 1034n,
      paymentMethod: "card",
      paymentValidated: true,
      fareType: "Precio cerrado",
      platformBonusCents: BigInt(320),
    },
  ];
}

const PAYMENTS_MAX_WINDOW_MS = 23 * 60 * 60 * 1000;

function clampPaymentsWindow(from: Date, to: Date): { startMs: number; endMs: number } {
  const endMs = Math.min(to.getTime(), Date.now());
  const startMs = Math.max(from.getTime(), endMs - PAYMENTS_MAX_WINDOW_MS);
  return { startMs, endMs };
}

export const uberConnector: FleetConnector = {
  platform: "UBER",

  async verifyConnection(_tenantId: string, _credentialsRef: string): Promise<ConnectionResult> {
    const ready = uberFleetEnvReady();
    if (!ready.ok) {
      return { ok: false, message: `Missing ${ready.missing.join(", ")}` };
    }

    const probe = await probeUberFleetApi();
    if (!probe.ok) {
      return { ok: false, message: probe.message };
    }

    return {
      ok: true,
    };
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

    const ready = uberFleetEnvReady();
    if (!ready.ok) {
      return [];
    }

    const dpa = await withTenant(params.tenantId, (tx) =>
      tx.driverPlatformAccount.findFirst({
        where: { id: params.driverPlatformAccountId, platform: "UBER" },
        select: { externalDriverId: true },
      }),
    );
    if (!dpa?.externalDriverId) {
      return [];
    }

    const orgOverride = await resolveTenantUberOrgId(params.tenantId);
    const org = await resolveUberOrgId(orgOverride);
    if (!org.ok) {
      console.warn("[uber] syncTrips:", org.message);
      return [];
    }

    const { startMs, endMs } = clampPaymentsWindow(params.from, params.to);
    const payments = await fetchUberDriverPayments({
      orgId: org.data,
      startTimeMs: startMs,
      endTimeMs: endMs,
      driverId: dpa.externalDriverId,
    });

    const byTripList: NormalizedTripUpsert[] = [];

    const useDriverApi =
      pick("UBER_SYNC_USE_DRIVER_API") !== "0" &&
      pick("UBER_SYNC_USE_DRIVER_API")?.toLowerCase() !== "false";

    if (useDriverApi) {
      const driverToken = await resolveUberDriverAccessToken();
      if (driverToken.ok) {
        const driverSync = await syncUberTripsViaDriverApi({
          from: params.from,
          to: params.to,
          accessToken: driverToken.data,
        });
        if (driverSync.ok) {
          byTripList.push(...driverSync.data);
          if (driverSync.data.length > 0) {
            console.log(
              `[uber] Driver API: ${driverSync.tripsCount} trip(s), ${driverSync.paymentsCount} payment(s) → ${driverSync.data.length} upsert(s).`,
            );
          }
        } else {
          console.warn("[uber] syncTrips driver API:", driverSync.message);
        }
      }
    }

    if (payments.ok) {
      byTripList.push(...uberPaymentsToTripUpserts(payments.data));
    } else {
      console.warn("[uber] syncTrips payments:", payments.message);
    }

    const useReports =
      pick("UBER_SYNC_USE_REPORTS") !== "0" &&
      pick("UBER_SYNC_USE_REPORTS")?.toLowerCase() !== "false";

    if (useReports) {
      const reportTrips = await syncUberTripsViaReports({
        tenantId: params.tenantId,
        driverId: dpa.externalDriverId,
        from: params.from,
        to: params.to,
      });
      if (reportTrips.ok) {
        byTripList.push(...reportTrips.data);
      } else {
        console.warn("[uber] syncTrips reports:", reportTrips.message);
      }
    }

    return mergeUberDriverTripUpserts([], byTripList);
  },

  async syncDriverDayMetrics(params: {
    tenantId: string;
    driverPlatformAccountId: string;
    date: Date;
  }): Promise<DriverDayMetrics> {
    const stub = pick("FLEETHUB_SYNC_STUB_TRIPS");
    if (stub === "1" || stub?.toLowerCase() === "true") {
      const day = params.date.getUTCDate();
      return {
        hoursOnline: 2.5 + (day % 5) * 0.4,
        rejections: day % 6 === 0 ? 1 : 0,
        missed: day % 4 === 0 ? 2 : day % 3 === 0 ? 1 : 0,
      };
    }

    const ready = uberFleetEnvReady();
    const dayStart = new Date(
      Date.UTC(
        params.date.getUTCFullYear(),
        params.date.getUTCMonth(),
        params.date.getUTCDate(),
      ),
    );
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const dpa = await withTenant(params.tenantId, (tx) =>
      tx.driverPlatformAccount.findFirst({
        where: { id: params.driverPlatformAccountId, platform: "UBER" },
        select: { externalDriverId: true },
      }),
    );

    if (ready.ok && dpa?.externalDriverId) {
      const orgOverride = await resolveTenantUberOrgId(params.tenantId);
      const org = await resolveUberOrgId(orgOverride);
      if (org.ok) {
        const fromApi = await fetchUberDriverDayMetrics({
          orgId: org.data,
          driverUuid: dpa.externalDriverId,
          day: params.date,
        });
        if (fromApi != null && fromApi.hoursOnline > 0) {
          return fromApi;
        }
      }
    }

    const trips = await withTenant(params.tenantId, (tx) =>
      tx.trip.findMany({
        where: {
          driverPlatformAccountId: params.driverPlatformAccountId,
          platform: "UBER",
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
    const ready = uberFleetEnvReady();
    if (!ready.ok) return "unknown";

    const dpa = await withTenant(params.tenantId, (tx) =>
      tx.driverPlatformAccount.findFirst({
        where: { id: params.driverPlatformAccountId, platform: "UBER" },
        select: { externalDriverId: true },
      }),
    );
    if (!dpa?.externalDriverId) return "unknown";

    const orgOverride = await resolveTenantUberOrgId(params.tenantId);
    const org = await resolveUberOrgId(orgOverride);
    if (!org.ok) return "unknown";

    const drivers = await listUberDrivers(org.data, 100);
    if (!drivers.ok) return "unknown";

    const row = drivers.data.find(
      (d) => uberDriverExternalId(d) === dpa.externalDriverId,
    );
    if (!row?.status) return "unknown";

    return classifyUberDriverStatus(row.status);
  },
};

/** @internal — smoke test from CLI */
export async function testUberFleetConnection(): Promise<string> {
  const token = await getUberFleetAccessToken();
  if (!token.ok) return `FAIL token: ${token.message}`;
  const probe = await probeUberFleetApi();
  if (!probe.ok) return `FAIL probe: ${probe.message}`;
  return `OK — ${probe.data.orgCount} org(s), ${probe.data.driverCount} driver(s), org_id=${probe.data.orgId.slice(0, 12)}…`;
}
