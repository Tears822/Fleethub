import { Queue } from "bullmq";
import IORedis from "ioredis";
import type { RidePlatform } from "@fleethub/db";
import type { PlatformSyncJobData } from "../jobs/process-platform-sync.js";
import { FLEET_SYNC_QUEUE_NAME } from "../queues/constants.js";

const NARROW_SYNC_DELAY_MS = 8_000;

function narrowSyncEnabled(): boolean {
  const v = process.env.WEBHOOK_NARROW_SYNC_ENABLED?.trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "no";
}

/**
 * Enqueue a single-driver platform-sync after webhook enrich could not load full trip data.
 */
export async function enqueueNarrowPlatformSyncJob(args: {
  tenantId: string;
  platform: RidePlatform;
  driverPlatformAccountId: string;
}): Promise<string | undefined> {
  if (!narrowSyncEnabled()) return undefined;

  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) return undefined;

  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue(FLEET_SYNC_QUEUE_NAME, { connection });
  try {
    const data: PlatformSyncJobData = {
      tenantId: args.tenantId,
      platform: args.platform,
      trigger: "poll",
      driverPlatformAccountId: args.driverPlatformAccountId,
    };
    const job = await queue.add("platform-sync", data, {
      attempts: 2,
      delay: NARROW_SYNC_DELAY_MS,
      backoff: { type: "exponential", delay: 10_000 },
      jobId: `narrow-sync:${args.tenantId}:${args.driverPlatformAccountId}:${Date.now()}`,
    });
    return job.id;
  } finally {
    await queue.close();
    await connection.quit();
  }
}
