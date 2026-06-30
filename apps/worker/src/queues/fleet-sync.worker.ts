import { Worker } from "bullmq";
import type IORedis from "ioredis";
import { processPlatformSyncJob } from "../jobs/process-platform-sync";
import { FLEET_SYNC_QUEUE_NAME } from "./constants";

/** Default 45 min — Uber payment reports + rate limits can exceed 15 min. */
const DEFAULT_SYNC_LOCK_MS = 45 * 60_000;

export function createFleetSyncWorker(connection: IORedis): Worker {
  const concurrency = Math.max(1, Number(process.env.WORKER_SYNC_CONCURRENCY ?? "2") || 2);
  const lockDurationMs = Math.max(
    60_000,
    Number(process.env.WORKER_SYNC_LOCK_MS) || DEFAULT_SYNC_LOCK_MS,
  );
  return new Worker(FLEET_SYNC_QUEUE_NAME, processPlatformSyncJob, {
    connection,
    concurrency,
    lockDuration: lockDurationMs,
    stalledInterval: 60_000,
    maxStalledCount: 3,
  });
}
