import "./load-env.js";
import { open, readFile, unlink, type FileHandle } from "node:fs/promises";
import { createRedisConnection } from "./config/redis";
import { getRedisUrl } from "./config/env";
import { logIntegrationEnvSummary } from "./config/integration-env";
import { runQueueSmokeCheck } from "./queues/smoke";
import { scheduleAuditLogRetention } from "./jobs/purge-audit-retention.js";
import { scheduleIngestionEventRetention } from "./jobs/purge-ingestion-retention.js";
import { scheduleIngestionHourlyRollupRefresh } from "./jobs/refresh-ingestion-hourly-rollups.js";
import { scheduleDriverDayMetricsRefresh } from "./jobs/refresh-driver-day-metrics.js";
import { scheduleAutoPollWatchdog } from "./jobs/schedule-auto-poll-watchdog.js";
import { schedulePlatformSyncPoll } from "./jobs/schedule-platform-sync-poll.js";
import { scheduleSuperAdminSyncAlerts } from "./jobs/schedule-super-admin-sync-alerts.js";
import { scheduleSyncStaleEmailAlerts } from "./jobs/schedule-sync-stale-alerts.js";
import { createFleetSyncWorker } from "./queues/fleet-sync.worker";
import { handleFleetSyncJobStall } from "./lib/handle-fleet-sync-stall.js";
import { createWebhookIngestWorker } from "./queues/webhook-ingest.worker";
import { createTenantExportWorker } from "./queues/tenant-export.worker.js";
import {
  FLEET_SYNC_QUEUE_NAME,
  TENANT_EXPORT_QUEUE_NAME,
  WEBHOOK_INGEST_QUEUE_NAME,
} from "./queues/constants";

const DEFAULT_FLEET_WORKER_LOCK_FILE = "/tmp/fleethub-worker-fleet.lock";

async function readProcessCommand(pid: number): Promise<string | null> {
  try {
    const command = await readFile(`/proc/${pid}/cmdline`, "utf8");
    return command.replace(/\0/g, " ").trim();
  } catch {
    return null;
  }
}

async function isFleetWorkerProcess(pid: number): Promise<boolean> {
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return false;
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }

  const command = await readProcessCommand(pid);
  // Linux /proc is available in production. If it is not readable, treat the pid
  // as active rather than risk running two queue consumers.
  if (!command) return true;
  return command.includes("src/main.ts") && command.includes("fleethub");
}

async function acquireFleetWorkerLock(): Promise<() => Promise<void>> {
  const lockFile = process.env.FLEETHUB_WORKER_LOCK_FILE?.trim() || DEFAULT_FLEET_WORKER_LOCK_FILE;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let handle: FileHandle | null = null;
    try {
      handle = await open(lockFile, "wx", 0o600);
      await handle.writeFile(`${process.pid}\n${process.cwd()}\n${new Date().toISOString()}\n`);
      console.log(`[worker] Fleet worker lock acquired: ${lockFile} (pid ${process.pid})`);
      return async () => {
        await handle?.close().catch(() => undefined);
        await unlink(lockFile).catch(() => undefined);
      };
    } catch (e) {
      await handle?.close().catch(() => undefined);
      if (!(e instanceof Error) || !("code" in e) || e.code !== "EEXIST") throw e;

      const existing = await readFile(lockFile, "utf8").catch(() => "");
      const ownerPid = Number.parseInt(existing.split(/\s+/)[0] ?? "", 10);
      if (await isFleetWorkerProcess(ownerPid)) {
        throw new Error(
          `Another FleetHub fleet worker is already running (pid ${ownerPid}, lock ${lockFile}). Stop it before starting a second worker.`,
        );
      }

      console.warn(`[worker] Removing stale fleet worker lock: ${lockFile}`);
      await unlink(lockFile).catch(() => undefined);
    }
  }

  throw new Error(`Could not acquire FleetHub fleet worker lock after clearing stale lock.`);
}

async function main() {
  const mode = (process.env.WORKER_MODE ?? "smoke").trim().toLowerCase();
  console.log("[worker] FleetHub worker — Redis:", getRedisUrl());

  if (mode === "smoke") {
    const connection = createRedisConnection();
    try {
      logIntegrationEnvSummary();
      await runQueueSmokeCheck(connection);
      console.log("[worker] Smoke check OK (WORKER_MODE=smoke). Exiting.");
    } finally {
      await connection.quit();
    }
    return;
  }

  let releaseFleetWorkerLock: (() => Promise<void>) | null = null;
  if (mode !== "fleet") {
    console.error(`[worker] Unknown WORKER_MODE="${mode}". Use smoke or fleet.`);
    process.exit(1);
    return;
  }

  releaseFleetWorkerLock = await acquireFleetWorkerLock();
  const connection = createRedisConnection();

  logIntegrationEnvSummary();
  scheduleAuditLogRetention();
  scheduleIngestionEventRetention();
  scheduleIngestionHourlyRollupRefresh();
  scheduleDriverDayMetricsRefresh();
  schedulePlatformSyncPoll(connection);
  scheduleAutoPollWatchdog();
  scheduleSuperAdminSyncAlerts();
  scheduleSyncStaleEmailAlerts();
  const fleetWorker = createFleetSyncWorker(connection);
  const webhookWorker = createWebhookIngestWorker(connection);
  const exportWorker = createTenantExportWorker(connection);

  for (const w of [fleetWorker, webhookWorker, exportWorker]) {
    w.on("failed", (job, err) => {
      console.error("[worker] job failed", job?.id, w.name, err);
      if (w === fleetWorker) {
        void handleFleetSyncJobStall(connection, job, err).catch((e) =>
          console.error("[worker] fleet-sync stall handler error:", e),
        );
      }
    });
    w.on("completed", (job) => {
      console.log("[worker] job completed", w.name, job.id, job.name);
    });
  }

  await Promise.all([
    fleetWorker.waitUntilReady(),
    webhookWorker.waitUntilReady(),
    exportWorker.waitUntilReady(),
  ]);
  console.log(
    `[worker] Listening on "${FLEET_SYNC_QUEUE_NAME}", "${WEBHOOK_INGEST_QUEUE_NAME}", "${TENANT_EXPORT_QUEUE_NAME}" (WORKER_MODE=fleet). Ctrl+C to stop.`,
  );

  await new Promise<void>((resolve, reject) => {
    const stop = async () => {
      try {
        await fleetWorker.close();
        await webhookWorker.close();
        await exportWorker.close();
        await connection.quit();
        await releaseFleetWorkerLock?.();
        resolve();
      } catch (e) {
        reject(e);
      }
    };
    process.once("SIGINT", () => {
      void stop();
    });
    process.once("SIGTERM", () => {
      void stop();
    });
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
