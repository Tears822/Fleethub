import type IORedis from "ioredis";
import { autoPollHealthWhere, autoPollSuccessWhere, getTenantIntegrationSettings } from "@fleethub/auth";
import { RidePlatform, withoutTenant, withTenantRls } from "@fleethub/db";
import { getIntegrationEnvSnapshot } from "../config/integration-env.js";
import { enqueuePlatformSyncJob } from "../lib/enqueue-platform-sync-job.js";
import { FLEET_SYNC_QUEUE_NAME } from "../queues/constants.js";
import { isSyncRunStale } from "./sync-run-staleness.js";

const POLL_PLATFORMS = [RidePlatform.UBER, RidePlatform.FREENOW] as const;
const DEFAULT_TICK_MS = 60_000;
/** Retry Uber payment reports sooner after a PARTIAL sync (missing amounts). */
export const PAYMENTS_PARTIAL_RETRY_MINUTES = 5;
/** Max time a sync job may stay RUNNING before we treat it as orphaned (Uber reports can be slow). */
const RUNNING_STALE_MS = 12 * 60_000;
const POLL_HEARTBEAT_KEY = "fleethub:sync-poll:last-tick";
const POLL_ENQUEUE_KEY = "fleethub:sync-poll:last-enqueue";

function pollEnabled(): boolean {
  const v = process.env.FLEET_SYNC_POLL_ENABLED?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no") return false;
  return Boolean(process.env.REDIS_URL?.trim());
}

function tickMs(): number {
  const n = Number(process.env.FLEET_SYNC_POLL_TICK_MS);
  return Number.isFinite(n) && n >= 15_000 ? n : DEFAULT_TICK_MS;
}

function pollingMinutesFor(
  platform: RidePlatform,
  settings: Awaited<ReturnType<typeof getTenantIntegrationSettings>>,
): number {
  return platform === RidePlatform.UBER
    ? settings.pollingMinutesUber
    : settings.pollingMinutesFreeNow;
}

async function tenantHasLinkedDrivers(
  tenantId: string,
  platform: RidePlatform,
): Promise<boolean> {
  const count = await withTenantRls(tenantId, (tx) =>
    tx.driverPlatformAccount.count({
      where: { tenantId, platform, isActive: true },
    }),
  );
  return count > 0;
}

type StaleRunningRow = { id: string; tenantId: string; platform: RidePlatform };

/** Mark orphaned RUNNING rows and enqueue an immediate recovery poll for each.
 *  A run is orphaned only when its last heartbeat (cursorHint.heartbeatAt) — not
 *  its start time — is older than RUNNING_STALE_MS, so slow-but-alive syncs survive. */
async function reconcileStaleRunningSyncs(connection: IORedis): Promise<number> {
  const staleBefore = new Date(Date.now() - RUNNING_STALE_MS);
  const candidates = await withoutTenant((tx) =>
    tx.syncRun.findMany({
      where: { status: "RUNNING", startedAt: { lt: staleBefore } },
      select: { id: true, tenantId: true, platform: true, startedAt: true, cursorHint: true },
      take: 200,
    }),
  );
  const stuck = candidates.filter((row) =>
    isSyncRunStale(row.startedAt, row.cursorHint, RUNNING_STALE_MS),
  );

  let reconciled = 0;
  for (const row of stuck) {
    await withTenantRls(row.tenantId, (tx) =>
      tx.syncRun.update({
        where: { id: row.id },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          errorMessage:
            "Sync interrumpido (RUNNING obsoleto). Reintento automático encolado.",
        },
      }),
    );
    reconciled += 1;
    console.warn(
      `[worker] poll: reconciled stale RUNNING ${row.platform} for tenant ${row.tenantId}`,
    );

    const jobId = await enqueuePlatformSyncJob(
      connection,
      row.tenantId,
      row.platform as RidePlatform,
      "poll",
    );
    if (jobId) {
      console.log(
        `[worker] poll: enqueued recovery ${row.platform} for tenant ${row.tenantId} (job ${jobId})`,
      );
    }
  }
  return reconciled;
}

async function isSyncRunning(tenantId: string, platform: RidePlatform): Promise<boolean> {
  const running = await withTenantRls(tenantId, (tx) =>
    tx.syncRun.findFirst({
      where: { tenantId, platform, status: "RUNNING" },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true, cursorHint: true },
    }),
  );
  if (!running) return false;
  if (isSyncRunStale(running.startedAt, running.cursorHint, RUNNING_STALE_MS)) {
    console.warn(
      `[worker] poll: ${platform} sync RUNNING with no heartbeat >${RUNNING_STALE_MS / 60_000}m for tenant ${tenantId} — allowing new job`,
    );
    return false;
  }
  return true;
}

/** Last successful automatic poll — FAILED/PARTIAL/stale runs do not delay the next schedule. */
async function lastAutoPollFinishedAt(
  tenantId: string,
  platform: RidePlatform,
): Promise<Date | null> {
  const last = await withTenantRls(tenantId, (tx) =>
    tx.syncRun.findFirst({
      where: {
        tenantId,
        platform,
        ...autoPollHealthWhere(),
      },
      orderBy: { finishedAt: "desc" },
      select: { finishedAt: true },
    }),
  );
  return last?.finishedAt ?? null;
}

async function lastPartialPollFinishedAt(
  tenantId: string,
  platform: RidePlatform,
): Promise<Date | null> {
  const last = await withTenantRls(tenantId, (tx) =>
    tx.syncRun.findFirst({
      where: {
        tenantId,
        platform,
        finishedAt: { not: null },
        status: { in: ["PARTIAL", "partial"] },
      },
      orderBy: { finishedAt: "desc" },
      select: { finishedAt: true },
    }),
  );
  return last?.finishedAt ?? null;
}

function shouldEnqueuePoll(args: {
  platform: RidePlatform;
  pollingMinutes: number;
  lastSuccessAt: Date | null;
  lastPartialAt: Date | null;
}): boolean {
  if (args.platform === RidePlatform.UBER && args.lastPartialAt != null) {
    const partialIsLatest =
      args.lastSuccessAt == null ||
      args.lastPartialAt.getTime() > args.lastSuccessAt.getTime();
    if (partialIsLatest) {
      return isDue(args.lastPartialAt, PAYMENTS_PARTIAL_RETRY_MINUTES);
    }
  }
  return isDue(args.lastSuccessAt, args.pollingMinutes);
}

function isDue(finishedAt: Date | null, pollingMinutes: number): boolean {
  if (!finishedAt) return true;
  return Date.now() - finishedAt.getTime() >= pollingMinutes * 60_000;
}

async function recordPollHeartbeat(
  connection: IORedis,
  enqueued: number,
): Promise<void> {
  if (connection.status !== "ready") return;
  const now = String(Date.now());
  await connection.set(POLL_HEARTBEAT_KEY, now);
  if (enqueued > 0) {
    await connection.set(POLL_ENQUEUE_KEY, now);
  }
}

export async function runPlatformSyncPoll(connection: IORedis): Promise<number> {
  if (connection.status !== "ready") {
    return 0;
  }
  await reconcileStaleRunningSyncs(connection);

  const env = getIntegrationEnvSnapshot();
  const tenants = await withoutTenant((tx) =>
    tx.tenant.findMany({
      where: { commercialStatus: "ACTIVE" },
      select: { id: true, slug: true },
    }),
  );

  let enqueued = 0;

  for (const tenant of tenants) {
    const integrations = await getTenantIntegrationSettings(tenant.id);

    for (const platform of POLL_PLATFORMS) {
      if (platform === RidePlatform.UBER && !env.uber.configured) continue;
      if (platform === RidePlatform.FREENOW && !env.freenow.configured) continue;

      if (!(await tenantHasLinkedDrivers(tenant.id, platform))) continue;
      if (await isSyncRunning(tenant.id, platform)) continue;

      const minutes = pollingMinutesFor(platform, integrations);
      const finishedAt = await lastAutoPollFinishedAt(tenant.id, platform);
      const partialAt =
        platform === RidePlatform.UBER
          ? await lastPartialPollFinishedAt(tenant.id, platform)
          : null;
      if (
        !shouldEnqueuePoll({
          platform,
          pollingMinutes: minutes,
          lastSuccessAt: finishedAt,
          lastPartialAt: partialAt,
        })
      ) {
        continue;
      }

      const jobId = await enqueuePlatformSyncJob(connection, tenant.id, platform, "poll");
      if (jobId) {
        enqueued += 1;
        console.log(
          `[worker] poll: enqueued ${platform} sync for "${tenant.slug}" (every ${minutes} min, job ${jobId})`,
        );
      }
    }
  }

  await recordPollHeartbeat(connection, enqueued);
  return enqueued;
}

/** Enqueue due Uber/FreeNow syncs on a timer (tenant settings.integrations polling minutes). */
export function schedulePlatformSyncPoll(connection: IORedis): void {
  if (!pollEnabled()) {
    console.log(
      "[worker] Platform sync poll disabled (set FLEET_SYNC_POLL_ENABLED=1 and REDIS_URL).",
    );
    return;
  }

  const intervalMs = tickMs();
  console.log(
    `[worker] Platform sync poll every ${intervalMs / 1000}s (queue "${FLEET_SYNC_QUEUE_NAME}").`,
  );

  let tick = 0;

  const run = async () => {
    try {
      tick += 1;
      const n = await runPlatformSyncPoll(connection);
      if (n > 0) {
        console.log(`[worker] poll: ${n} job(s) enqueued.`);
      } else if (tick % 15 === 0) {
        console.log("[worker] poll: tick OK, 0 jobs enqueued (intervals not due or sync running).");
      }
    } catch (err) {
      console.error("[worker] poll error:", err);
    }
  };

  void run();
  setInterval(() => void run(), intervalMs);
}

/** @internal tests */
export const __testOnly = {
  RUNNING_STALE_MS,
  PAYMENTS_PARTIAL_RETRY_MINUTES,
  isDue,
  shouldEnqueuePoll,
};
