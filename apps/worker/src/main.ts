import "./load-env.js";
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
import { scheduleSyncStaleEmailAlerts } from "./jobs/schedule-sync-stale-alerts.js";
import { createFleetSyncWorker } from "./queues/fleet-sync.worker";
import { createWebhookIngestWorker } from "./queues/webhook-ingest.worker";
import { createTenantExportWorker } from "./queues/tenant-export.worker.js";
import {
  FLEET_SYNC_QUEUE_NAME,
  TENANT_EXPORT_QUEUE_NAME,
  WEBHOOK_INGEST_QUEUE_NAME,
} from "./queues/constants";

async function main() {
  const mode = (process.env.WORKER_MODE ?? "smoke").trim().toLowerCase();
  console.log("[worker] FleetHub worker — Redis:", getRedisUrl());

  const connection = createRedisConnection();

  if (mode === "smoke") {
    try {
      logIntegrationEnvSummary();
      await runQueueSmokeCheck(connection);
      console.log("[worker] Smoke check OK (WORKER_MODE=smoke). Exiting.");
    } finally {
      await connection.quit();
    }
    return;
  }

  if (mode !== "fleet") {
    console.error(`[worker] Unknown WORKER_MODE="${mode}". Use smoke or fleet.`);
    await connection.quit();
    process.exit(1);
    return;
  }

  logIntegrationEnvSummary();
  scheduleAuditLogRetention();
  scheduleIngestionEventRetention();
  scheduleIngestionHourlyRollupRefresh();
  scheduleDriverDayMetricsRefresh();
  schedulePlatformSyncPoll(connection);
  scheduleAutoPollWatchdog();
  scheduleSyncStaleEmailAlerts();
  const fleetWorker = createFleetSyncWorker(connection);
  const webhookWorker = createWebhookIngestWorker(connection);
  const exportWorker = createTenantExportWorker(connection);

  for (const w of [fleetWorker, webhookWorker, exportWorker]) {
    w.on("failed", (job, err) => {
      console.error("[worker] job failed", job?.id, w.name, err);
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
