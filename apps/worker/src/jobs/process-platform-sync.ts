import type { Job } from "bullmq";
import type { DriverDayMetrics, NormalizedTripUpsert } from "@fleethub/contracts";
import {
  backfillDriverPlatformDayMetricsFromTrips,
  ingestSourceFromSyncTrigger,
  syncRunPaymentsPendingMessage,
  upsertDriverPlatformDayMetric,
  upsertNormalizedTripsForDriver,
} from "@fleethub/auth";
import { RidePlatform, withTenant } from "@fleethub/db";
import { getFleetConnector } from "../connectors/registry";
import {
  fetchFreenowTripsByDriver,
  fetchFreenowTripsByDriverMultiCompany,
} from "../lib/freenow-bookings.js";
import { resolveFreenowTripsForDriverAccount } from "../lib/freenow-driver-match.js";
import {
  freenowPublicCompanyIdFromMetadata,
  resolveFreenowFleetCompanyMappings,
  resolveTenantFreenowPublicCompanyIds,
  resolveFreenowPublicCompanyIdForDriver,
} from "../lib/freenow-company-map.js";
import { isFreenowPublicDriverId } from "../lib/freenow-link-drivers.js";
import { computeFreenowDayMetrics } from "../lib/freenow-day-metrics.js";
import { enrichFreenowTripsWithDriverEarnings } from "../lib/freenow-earnings-mapper.js";
import type { FreenowBooking } from "../lib/freenow-sdk.js";
import {
  syncFreenowDriversForAllLinkedCompanies,
  syncUberDriversForTenant,
} from "../lib/platform-driver-sync.js";
import {
  clearUberTripActivityCache,
  invalidateUberPaymentsReportCache,
  prefetchUberOrgReports,
} from "../lib/uber-reports.js";
import { summarizeUberTripAmountsInWindow } from "../lib/uber-payment-window.js";
import { resolveTenantUberOrgId } from "../lib/tenant-platform-config.js";
import { resolveUberOrgId } from "../lib/uber-fleet-client.js";
import { freenowSyncRange } from "../lib/freenow-sync-window.js";
import { uberSyncRange } from "../lib/uber-sync-window.js";
import {
  resolveTenantFreenowPublicCompanyId,
  resolveTenantFreenowSyncDays,
  resolveTenantUberSyncDays,
} from "../lib/tenant-platform-config.js";
import { refreshDriverConnectionsForTenant } from "../live/refresh-driver-connections.js";
import { isSyncRunStale } from "./sync-run-staleness.js";

export type PlatformSyncTrigger = "manual" | "poll";

export type PlatformSyncJobData = {
  tenantId: string;
  platform: RidePlatform;
  /** How the job was enqueued (shown in Configuración sync history). */
  trigger?: PlatformSyncTrigger;
  /** Single-driver recovery sync (e.g. after webhook enrich failure). */
  driverPlatformAccountId?: string;
};

function parsePlatform(raw: unknown): RidePlatform {
  if (raw === RidePlatform.UBER || raw === "UBER") {
    return RidePlatform.UBER;
  }
  if (raw === RidePlatform.FREENOW || raw === "FREENOW") {
    return RidePlatform.FREENOW;
  }
  if (raw === RidePlatform.BOLT || raw === "BOLT") {
    return RidePlatform.BOLT;
  }
  if (raw === RidePlatform.CABIFY || raw === "CABIFY") {
    return RidePlatform.CABIFY;
  }
  throw new Error(`Unsupported platform: ${String(raw)}`);
}

function utcDayOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Align with `schedule-platform-sync-poll` stale RUNNING reconciliation. */
const RUNNING_STALE_MS = 12 * 60_000;
/** While running, refresh cursorHint.heartbeatAt so slow-but-alive syncs
 *  (e.g. 28-day Uber report backfills) are not reconciled as orphaned. */
const SYNC_HEARTBEAT_MS = 60_000;

export async function processPlatformSyncJob(job: Job<PlatformSyncJobData>): Promise<void> {
  const tenantId = job.data?.tenantId;
  if (!tenantId || typeof tenantId !== "string") {
    throw new Error("platform-sync job missing tenantId");
  }
  const platform = parsePlatform(job.data?.platform);
  const trigger: PlatformSyncTrigger = job.data?.trigger === "poll" ? "poll" : "manual";
  const narrowDriverPlatformAccountId =
    typeof job.data?.driverPlatformAccountId === "string"
      ? job.data.driverPlatformAccountId.trim()
      : "";
  const ingestSource = ingestSourceFromSyncTrigger(trigger);
  const connector = getFleetConnector(platform);

  const existingRunning = await withTenant(tenantId, (tx) =>
    tx.syncRun.findFirst({
      where: { tenantId, platform, status: "RUNNING" },
      orderBy: { startedAt: "desc" },
      select: { id: true, startedAt: true, cursorHint: true },
    }),
  );
  if (
    existingRunning &&
    !isSyncRunStale(existingRunning.startedAt, existingRunning.cursorHint, RUNNING_STALE_MS)
  ) {
    console.warn(
      `[worker] platform-sync ${tenantId} ${platform}: skipped — another sync RUNNING since ${existingRunning.startedAt.toISOString()}`,
    );
    return;
  }

  let tripsUpserted = 0;
  let tripsCreated = 0;
  let tripsUpdated = 0;
  let ingestCollisions = 0;
  let uberPaymentSummary: Awaited<
    ReturnType<typeof summarizeUberTripAmountsInWindow>
  > | null = null;

  const run = await withTenant(tenantId, (tx) =>
    tx.syncRun.create({
      data: {
        tenantId,
        platform,
        status: "RUNNING",
        cursorHint: {
          trigger,
          ingestSource,
          heartbeatAt: new Date().toISOString(),
          ...(narrowDriverPlatformAccountId
            ? { narrowDriverPlatformAccountId }
            : {}),
        },
      },
    }),
  );

  let heartbeat: ReturnType<typeof setInterval> | null = null;
  const stopHeartbeat = () => {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
  };
  const writeHeartbeat = async () => {
    try {
      await withTenant(tenantId, async (tx) => {
        const current = await tx.syncRun.findUnique({
          where: { id: run.id },
          select: { status: true, cursorHint: true },
        });
        if (!current || current.status.toUpperCase() !== "RUNNING") {
          stopHeartbeat();
          return;
        }
        const base =
          current.cursorHint && typeof current.cursorHint === "object"
            ? (current.cursorHint as Record<string, unknown>)
            : {};
        await tx.syncRun.update({
          where: { id: run.id },
          data: { cursorHint: { ...base, heartbeatAt: new Date().toISOString() } },
        });
      });
    } catch (err) {
      console.warn(
        `[worker] platform-sync ${tenantId} ${platform}: heartbeat failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  };
  heartbeat = setInterval(() => void writeHeartbeat(), SYNC_HEARTBEAT_MS);
  heartbeat.unref?.();

  const finish = async (status: string, errorMessage?: string | null) => {
    const normalized = status.trim().toUpperCase();
    const paymentsComplete =
      uberPaymentSummary == null || uberPaymentSummary.missing === 0;
    const updated = await withTenant(tenantId, async (tx) => {
      const current = await tx.syncRun.findUnique({
        where: { id: run.id },
        select: { status: true },
      });
      if (!current || current.status.toUpperCase() !== "RUNNING") {
        console.warn(
          `[worker] platform-sync ${tenantId} ${platform}: skip finish(${normalized}) — run ${run.id} is ${current?.status ?? "missing"}`,
        );
        return false;
      }
      await tx.syncRun.update({
        where: { id: run.id },
        data: {
          status: normalized,
          finishedAt: new Date(),
          errorMessage: errorMessage ? errorMessage.slice(0, 2000) : null,
          cursorHint: {
            trigger,
            ingestSource,
            tripsUpserted,
            tripsCreated,
            tripsUpdated,
            ingestCollisions,
            ...(uberPaymentSummary
              ? {
                  tripsWithAmounts: uberPaymentSummary.withAmounts,
                  tripsMissingAmounts: uberPaymentSummary.missing,
                  paymentsComplete,
                }
              : {}),
            ...(narrowDriverPlatformAccountId
              ? { narrowDriverPlatformAccountId }
              : {}),
          },
        },
      });
      return true;
    });
    if (!updated) return;
    stopHeartbeat();
  };

  try {
    const verify = await connector.verifyConnection(tenantId, "fleet");
    if (!verify.ok) {
      await finish("failed", verify.message);
      return;
    }

    if (!narrowDriverPlatformAccountId && platform === RidePlatform.UBER) {
      try {
        const sync = await syncUberDriversForTenant(tenantId);
        if (!sync.ok) {
          console.warn("[worker] uber driver sync:", sync.message);
        } else if (sync.created > 0 || sync.linked > 0) {
          console.log(
            `[worker] uber drivers: created ${sync.created}, linked ${sync.linked} (${sync.platformDrivers} in Uber org).`,
          );
        }
      } catch (err) {
        console.warn(
          "[worker] uber driver sync error (continuing trip sync):",
          err instanceof Error ? err.message : err,
        );
      }
    }

    if (!narrowDriverPlatformAccountId && platform === RidePlatform.FREENOW) {
      const sync = await syncFreenowDriversForAllLinkedCompanies(tenantId);
      if (!sync.ok) {
        console.warn("[worker] freenow driver sync:", sync.message);
      } else if (sync.created > 0 || sync.linked > 0) {
        console.log(
          `[worker] freenow drivers: created ${sync.created}, linked ${sync.linked} (${sync.platformDrivers} on umbrella).`,
        );
      }
    }

    const dpas = await withTenant(tenantId, (tx) =>
      tx.driverPlatformAccount.findMany({
        where: { tenantId, platform, isActive: true },
        select: { id: true, driverId: true, externalDriverId: true, metadata: true },
      }),
    );

    let syncDpas =
      platform === RidePlatform.UBER || platform === RidePlatform.FREENOW
        ? dpas.filter((d) => !d.externalDriverId.startsWith("seed-"))
        : dpas;

    if (narrowDriverPlatformAccountId) {
      syncDpas = syncDpas.filter((d) => d.id === narrowDriverPlatformAccountId);
    }

    if (syncDpas.length === 0) {
      await finish(
        "skipped",
        platform === RidePlatform.UBER
          ? "No Uber driver_platform_accounts linked (run link: names must match Uber)."
          : platform === RidePlatform.FREENOW
            ? "No FreeNow driver_platform_accounts linked (names must match FreeNow drivers)."
            : "No active driver_platform_accounts for this platform.",
      );
      return;
    }

    const driverNamesById = new Map(
      (
        await withTenant(tenantId, (tx) =>
          tx.driver.findMany({
            where: { tenantId, id: { in: syncDpas.map((d) => d.driverId) } },
            select: { id: true, fullName: true },
          }),
        )
      ).map((d) => [d.id, d.fullName] as const),
    );

    async function upgradeFreenowPublicDriverId(
      dpa: { id: string; driverId: string; externalDriverId: string; metadata: unknown },
      publicDriverId: string,
      earningsCompanyId: string,
    ): Promise<void> {
      if (!isFreenowPublicDriverId(publicDriverId)) return;
      const current = dpa.externalDriverId.trim();
      if (current === publicDriverId) return;
      if (isFreenowPublicDriverId(current)) return;

      await withTenant(tenantId, (tx) =>
        tx.driverPlatformAccount.update({
          where: { id: dpa.id },
          data: {
            externalDriverId: publicDriverId,
            metadata: {
              ...(typeof dpa.metadata === "object" && dpa.metadata
                ? (dpa.metadata as Record<string, unknown>)
                : {}),
              freenowPublicCompanyId: earningsCompanyId,
              freenowLinkedAt: new Date().toISOString(),
              freenowSpreadsheetCode: current,
            },
          },
        }),
      );
      dpa.externalDriverId = publicDriverId;
    }

    const to = new Date();
    const uberDays =
      platform === RidePlatform.UBER ? await resolveTenantUberSyncDays(tenantId) : 7;
    const freenowDays =
      platform === RidePlatform.FREENOW ? await resolveTenantFreenowSyncDays(tenantId) : 7;
    const from =
      platform === RidePlatform.UBER
        ? uberSyncRange(to, uberDays).from
        : freenowSyncRange(to, freenowDays).from;
    let freenowTripsByDriver: Map<string, NormalizedTripUpsert[]> | null = null;
    let freenowAllBookings: FreenowBooking[] | null = null;
    const freenowTripsByDpaId = new Map<string, NormalizedTripUpsert[]>();

    let freenowPublicCompanyId: string | null = null;
    let freenowCompanyIds: string[] = [];
    let freenowCompanyByFleetId = new Map<string, string>();

    if (platform === RidePlatform.UBER) {
      await prefetchUberOrgReports(tenantId, from, to);
    }

    if (platform === RidePlatform.FREENOW) {
      freenowPublicCompanyId = await resolveTenantFreenowPublicCompanyId(tenantId);
      freenowCompanyIds = await resolveTenantFreenowPublicCompanyIds(tenantId);
      const mappings = await resolveFreenowFleetCompanyMappings(tenantId);
      freenowCompanyByFleetId = new Map(
        mappings.map((m) => [m.fleetCompanyId, m.publicCompanyId]),
      );

      if (narrowDriverPlatformAccountId && syncDpas.length === 1) {
        const dpa = syncDpas[0]!;
        const companyId = await resolveFreenowPublicCompanyIdForDriver(
          tenantId,
          dpa.driverId,
          dpa.metadata,
        );
        const bookingBatch = await fetchFreenowTripsByDriver({
          publicCompanyId: companyId,
          from,
          to,
        });
        if (!bookingBatch.ok) {
          await finish("failed", bookingBatch.message);
          return;
        }
        freenowAllBookings = bookingBatch.bookings;
        const driverName = driverNamesById.get(dpa.driverId) ?? "";
        const resolved = resolveFreenowTripsForDriverAccount({
          externalDriverId: dpa.externalDriverId,
          driverFullName: driverName,
          tripsByDriver: bookingBatch.tripsByDriver,
          bookings: bookingBatch.bookings,
        });
        if (resolved.publicDriverId) {
          await upgradeFreenowPublicDriverId(dpa, resolved.publicDriverId, companyId);
        }
        const enriched = await enrichFreenowTripsWithDriverEarnings({
          publicCompanyId: companyId,
          publicDriverId: dpa.externalDriverId.trim(),
          from,
          to,
          trips: resolved.trips,
        });
        if (enriched.message && !enriched.enriched) {
          console.warn(
            `[worker] freenow earnings skip driver=${dpa.externalDriverId.slice(0, 8)}…: ${enriched.message}`,
          );
        }
        freenowTripsByDpaId.set(dpa.id, enriched.trips);
      } else {
        const batch = await fetchFreenowTripsByDriverMultiCompany({
          publicCompanyIds: freenowCompanyIds,
          from,
          to,
        });
        if (!batch.ok) {
          await finish("failed", batch.message);
          return;
        }
        freenowTripsByDriver = batch.tripsByDriver;
        freenowAllBookings = batch.bookings;
        console.log(
          `[worker] freenow bookings (${freenowCompanyIds.length} company id(s)): ${batch.bookingCount} row(s), ${batch.tripsByDriver.size} driver(s) with trips.`,
        );
      }
    }

    const driverCompanyById =
      platform === RidePlatform.FREENOW && syncDpas.length > 0
        ? new Map(
            (
              await withTenant(tenantId, (tx) =>
                tx.driver.findMany({
                  where: { tenantId, id: { in: syncDpas.map((d) => d.driverId) } },
                  select: { id: true, companyId: true },
                }),
              )
            ).map((d) => [d.id, d.companyId]),
          )
        : new Map<string, string>();

    for (const dpa of syncDpas) {
      let trips: NormalizedTripUpsert[];
      if (platform === RidePlatform.FREENOW && freenowTripsByDpaId.has(dpa.id)) {
        trips = freenowTripsByDpaId.get(dpa.id) ?? [];
      } else if (platform === RidePlatform.FREENOW && freenowTripsByDriver) {
        const driverName = driverNamesById.get(dpa.driverId) ?? "";
        const fleetCompanyId = driverCompanyById.get(dpa.driverId);
        const earningsCompanyId =
          freenowPublicCompanyIdFromMetadata(dpa.metadata) ??
          (fleetCompanyId ? freenowCompanyByFleetId.get(fleetCompanyId) : undefined) ??
          freenowPublicCompanyId!;
        const resolved = resolveFreenowTripsForDriverAccount({
          externalDriverId: dpa.externalDriverId,
          driverFullName: driverName,
          tripsByDriver: freenowTripsByDriver,
          bookings: freenowAllBookings ?? [],
        });
        if (resolved.publicDriverId) {
          await upgradeFreenowPublicDriverId(dpa, resolved.publicDriverId, earningsCompanyId);
        }
        const enriched = await enrichFreenowTripsWithDriverEarnings({
          publicCompanyId: earningsCompanyId,
          publicDriverId: dpa.externalDriverId.trim(),
          from,
          to,
          trips: resolved.trips,
        });
        if (enriched.message && !enriched.enriched) {
          console.warn(
            `[worker] freenow earnings skip driver=${dpa.externalDriverId.slice(0, 8)}…: ${enriched.message}`,
          );
        }
        trips = enriched.trips;
      } else {
        trips = await connector.syncTrips({
          tenantId,
          driverPlatformAccountId: dpa.id,
          from,
          to,
        });
      }

      const tripResult = await upsertNormalizedTripsForDriver(
        tenantId,
        dpa.id,
        dpa.driverId,
        platform,
        trips,
        ingestSource,
        { syncRunId: run.id },
      );
      tripsUpserted += tripResult.upserted;
      tripsCreated += tripResult.created;
      tripsUpdated += tripResult.updated;
      ingestCollisions += tripResult.ingestCollisions;

      const metricDays = new Set<number>();
      metricDays.add(utcDayOnly(to).getTime());
      for (const t of trips) {
        metricDays.add(utcDayOnly(new Date(t.startedAt)).getTime());
      }

      for (const dayMs of metricDays) {
        const day = new Date(dayMs);
        let dayMetrics: DriverDayMetrics;
        if (platform === RidePlatform.FREENOW && freenowAllBookings) {
          dayMetrics = computeFreenowDayMetrics(
            freenowAllBookings,
            dpa.externalDriverId.trim(),
            day,
          );
        } else {
          dayMetrics = await connector.syncDriverDayMetrics({
            tenantId,
            driverPlatformAccountId: dpa.id,
            date: day,
          });
        }
        await upsertDriverPlatformDayMetric({
          tenantId,
          driverId: dpa.driverId,
          platform,
          day,
          hoursOnlineMinutes: Math.max(0, Math.round(dayMetrics.hoursOnline * 60)),
          missedOffers: dayMetrics.missed,
          rejectedTrips: dayMetrics.rejections,
        });
      }

      const syncedTrips = await withTenant(tenantId, (tx) =>
        tx.trip.findMany({
          where: {
            tenantId,
            driverId: dpa.driverId,
            platform,
            startedAt: { gte: from, lte: to },
          },
          select: {
            startedAt: true,
            endedAt: true,
            grossAmountCents: true,
            netAmountCents: true,
          },
        }),
      );
      await backfillDriverPlatformDayMetricsFromTrips(
        tenantId,
        dpa.driverId,
        platform,
        syncedTrips,
        { onlyIfMissing: true },
      );
    }

    if (platform === RidePlatform.UBER || platform === RidePlatform.FREENOW) {
      try {
        const live = await refreshDriverConnectionsForTenant(tenantId, { force: true });
        console.log(
          `[worker] connection refresh: uber=${live.uberUpdated} freenow=${live.freenowUpdated}`,
        );
      } catch (e) {
        console.warn(
          "[worker] connection refresh failed:",
          e instanceof Error ? e.message : String(e),
        );
      }
    }

    if (platform === RidePlatform.UBER) {
      uberPaymentSummary = await summarizeUberTripAmountsInWindow(tenantId, from, to);
      if (uberPaymentSummary.missing > 0 && uberPaymentSummary.total > 0) {
        const orgOverride = await resolveTenantUberOrgId(tenantId);
        const org = await resolveUberOrgId(orgOverride);
        if (org.ok) {
          invalidateUberPaymentsReportCache(org.data, from, to);
        }
        const pendingMsg = syncRunPaymentsPendingMessage({
          paymentsComplete: false,
          tripsMissingAmounts: uberPaymentSummary.missing,
          tripsWithAmounts: uberPaymentSummary.withAmounts,
        });
        await finish("partial", pendingMsg);
        console.warn(
          `[worker] platform-sync ${tenantId} UBER (${ingestSource}): PARTIAL — ${uberPaymentSummary.missing}/${uberPaymentSummary.total} trip(s) without amounts.`,
        );
        clearUberTripActivityCache();
        return;
      }
    }

    await finish("success");
    if (tripsUpserted > 0) {
      console.log(
        `[worker] platform-sync ${tenantId} ${platform} (${ingestSource}): upserted ${tripsUpserted} trip(s).`,
      );
    }
    if (platform === RidePlatform.UBER) {
      clearUberTripActivityCache();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (platform === RidePlatform.UBER) {
      clearUberTripActivityCache();
    }
    await finish("failed", msg);
    throw e;
  } finally {
    stopHeartbeat();
  }
}
