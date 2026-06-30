import { failRunningSyncRunsForStalledJob } from "@fleethub/auth";
import { RidePlatform } from "@fleethub/db";
import type IORedis from "ioredis";
import type { Job } from "bullmq";
import { enqueuePlatformSyncJob } from "./enqueue-platform-sync-job.js";
import type { PlatformSyncJobData } from "../jobs/process-platform-sync.js";

function parsePlatform(raw: unknown): RidePlatform | null {
  if (raw === RidePlatform.UBER || raw === "UBER") return RidePlatform.UBER;
  if (raw === RidePlatform.FREENOW || raw === "FREENOW") return RidePlatform.FREENOW;
  return null;
}

/** After a BullMQ stall, fail orphaned RUNNING rows and enqueue recovery. */
export async function handleFleetSyncJobStall(
  connection: IORedis,
  job: Job<PlatformSyncJobData> | undefined,
  err: Error,
): Promise<void> {
  const msg = err.message?.toLowerCase() ?? "";
  if (!msg.includes("stall")) return;

  const tenantId = job?.data?.tenantId;
  const platform = parsePlatform(job?.data?.platform);
  if (!tenantId || !platform) return;

  const failed = await failRunningSyncRunsForStalledJob(tenantId, platform);
  if (failed === 0) return;

  console.warn(
    `[worker] fleet-sync stall: reconciled ${failed} RUNNING row(s) for ${tenantId} ${platform}`,
  );
  const jobId = await enqueuePlatformSyncJob(connection, tenantId, platform, "poll");
  if (jobId) {
    console.log(`[worker] fleet-sync stall: enqueued recovery ${platform} (job ${jobId})`);
  }
}
