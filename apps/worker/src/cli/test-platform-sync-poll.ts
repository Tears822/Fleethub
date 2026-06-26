/**
 * Smoke / integration test for automatic platform sync poll.
 * Usage: npm run test:platform-sync-poll -w @fleethub/worker
 */
import "../load-env.js";
import assert from "node:assert/strict";
import { Queue } from "bullmq";
import { autoPollSuccessWhere } from "@fleethub/auth";
import { RidePlatform, withoutTenant } from "@fleethub/db";
import { createRedisConnection } from "../config/redis.js";
import { enqueuePlatformSyncJob } from "../lib/enqueue-platform-sync-job.js";
import { runPlatformSyncPoll, __testOnly } from "../jobs/schedule-platform-sync-poll.js";
import { FLEET_SYNC_QUEUE_NAME } from "../queues/constants.js";

async function main() {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    console.error("SKIP: REDIS_URL not set");
    process.exit(0);
  }

  const connection = createRedisConnection();
  const queue = new Queue(FLEET_SYNC_QUEUE_NAME, { connection });

  try {
    console.log("[test] autoPollSuccessWhere filter:", JSON.stringify(autoPollSuccessWhere()));

    const lastSuccess = await withoutTenant((tx) =>
      tx.syncRun.findFirst({
        where: autoPollSuccessWhere(),
        orderBy: { finishedAt: "desc" },
        select: { tenantId: true, platform: true, finishedAt: true, status: true },
      }),
    );
    console.log(
      "[test] last global auto poll success:",
      lastSuccess
        ? `${lastSuccess.platform} @ ${lastSuccess.finishedAt?.toISOString()} (${lastSuccess.status})`
        : "none",
    );

    const lastFailedPoll = await withoutTenant((tx) =>
      tx.syncRun.findFirst({
        where: {
          status: "FAILED",
          OR: [
            { cursorHint: { path: ["trigger"], equals: "poll" } },
            { cursorHint: { path: ["ingestSource"], equals: "poll_fallback" } },
          ],
        },
        orderBy: { finishedAt: "desc" },
        select: { platform: true, finishedAt: true, errorMessage: true },
      }),
    );
    if (lastFailedPoll) {
      console.log(
        "[test] last failed auto poll:",
        `${lastFailedPoll.platform} @ ${lastFailedPoll.finishedAt?.toISOString()} — ${lastFailedPoll.errorMessage?.slice(0, 80)}`,
      );
    }

    const tenant = await withoutTenant((tx) =>
      tx.tenant.findFirst({
        where: { commercialStatus: "ACTIVE", slug: "trade-taxi-sl" },
        select: { id: true, slug: true },
      }),
    );
    assert.ok(tenant, "trade-taxi-sl tenant expected for integration smoke");

    const jobId = `platform-sync:${tenant.id}:${RidePlatform.FREENOW}`;
    const first = await enqueuePlatformSyncJob(
      connection,
      tenant.id,
      RidePlatform.FREENOW,
      "poll",
    );
    assert.equal(first, jobId, "poll enqueue should use stable jobId");

    const duplicate = await enqueuePlatformSyncJob(
      connection,
      tenant.id,
      RidePlatform.FREENOW,
      "poll",
    );
    assert.equal(duplicate, jobId, "duplicate poll enqueue should return same jobId");

    const activeJob = await queue.getJob(jobId);
    assert.ok(activeJob, "deduplicated job should exist in queue");
    const state = await activeJob.getState();
    console.log(`[test] job ${jobId} state after duplicate enqueue: ${state}`);
    assert.ok(
      state === "waiting" || state === "active" || state === "delayed",
      `expected waiting/active/delayed, got ${state}`,
    );

    const enqueued = await runPlatformSyncPoll(connection);
    console.log(`[test] runPlatformSyncPoll enqueued ${enqueued} job(s)`);

    const staleBefore = new Date(Date.now() - __testOnly.RUNNING_STALE_MS - 1000);
    const stuck = await withoutTenant((tx) =>
      tx.syncRun.count({
        where: { status: "RUNNING", startedAt: { lt: staleBefore } },
      }),
    );
    console.log(`[test] RUNNING older than ${__testOnly.RUNNING_STALE_MS / 60_000}m: ${stuck}`);
    assert.equal(stuck, 0, "reconcile should clear stale RUNNING before scheduling");

    console.log("[test] platform-sync-poll smoke OK");
  } finally {
    await queue.close();
    await connection.quit();
  }
}

main().catch((err) => {
  console.error("[test] FAILED:", err);
  process.exit(1);
});
