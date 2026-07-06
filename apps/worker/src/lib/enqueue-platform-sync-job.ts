import { Queue } from "bullmq";
import type IORedis from "ioredis";
import type { RidePlatform } from "@fleethub/db";
import type { PlatformSyncTrigger } from "@fleethub/auth";
import type { PlatformSyncJobData } from "../jobs/process-platform-sync.js";
import { FLEET_SYNC_QUEUE_NAME } from "../queues/constants.js";

export async function enqueuePlatformSyncJob(
  connection: IORedis,
  tenantId: string,
  platform: RidePlatform,
  trigger: PlatformSyncTrigger = "manual",
  options?: Pick<PlatformSyncJobData, "driverPlatformAccountId">,
): Promise<string | undefined> {
  const queue = new Queue(FLEET_SYNC_QUEUE_NAME, { connection });
  const jobId = `platform-sync:${tenantId}:${platform}`;
  try {
    const existing = await queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === "failed") {
        await existing.retry();
        return jobId;
      }
      if (state === "waiting" || state === "delayed" || state === "active") {
        return jobId;
      }
      if (state === "completed") {
        await existing.remove();
      }
    }

    const job = await queue.add(
      "platform-sync",
      {
        tenantId,
        platform,
        trigger,
        ...(options?.driverPlatformAccountId
          ? { driverPlatformAccountId: options.driverPlatformAccountId }
          : {}),
      },
      {
        jobId,
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
    return job.id;
  } finally {
    await queue.close();
  }
}
