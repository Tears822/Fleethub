import { Worker } from "bullmq";
import type IORedis from "ioredis";
import { processPlatformSyncJob } from "../jobs/process-platform-sync";
import { FLEET_SYNC_QUEUE_NAME } from "./constants";

export function createFleetSyncWorker(connection: IORedis): Worker {
  const concurrency = Math.max(1, Number(process.env.WORKER_SYNC_CONCURRENCY ?? "2") || 2);
  const lockDurationMs = Math.max(
    60_000,
    Number(process.env.WORKER_SYNC_LOCK_MS) || 15 * 60_000,
  );
  return new Worker(FLEET_SYNC_QUEUE_NAME, processPlatformSyncJob, {
    connection,
    concurrency,
    lockDuration: lockDurationMs,
    stalledInterval: Math.min(lockDurationMs, 60_000),
    maxStalledCount: 1,
  });
}
