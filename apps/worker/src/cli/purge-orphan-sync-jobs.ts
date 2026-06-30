/**
 * Remove fleet-sync queue jobs whose tenantId no longer exists in DB.
 * Prevents FK errors when stale jobs are retried after tenant deletion.
 */
import "../load-env.js";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { withoutTenant } from "@fleethub/db";
import { FLEET_SYNC_QUEUE_NAME } from "../queues/constants.js";

function tenantIdFromJobId(jobId: string): string | null {
  const m = /^platform-sync:([^:]+):/.exec(jobId);
  return m?.[1] ?? null;
}

const conn = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
const queue = new Queue(FLEET_SYNC_QUEUE_NAME, { connection: conn });

const states = ["failed", "waiting", "delayed"] as const;
let removed = 0;

for (const state of states) {
  const jobs =
    state === "failed"
      ? await queue.getFailed(0, 200)
      : state === "waiting"
        ? await queue.getWaiting(0, 200)
        : await queue.getDelayed(0, 200);

  for (const job of jobs) {
    const tenantId = job.data?.tenantId ?? tenantIdFromJobId(String(job.id ?? ""));
    if (!tenantId || typeof tenantId !== "string") continue;

    const exists = await withoutTenant((tx) =>
      tx.tenant.findUnique({ where: { id: tenantId }, select: { id: true } }),
    );
    if (exists) continue;

    await job.remove();
    removed += 1;
    console.log("removed orphan", state, job.id, tenantId);
  }
}

const counts = await queue.getJobCounts("waiting", "active", "delayed", "failed");
console.log("removed total:", removed);
console.log("counts:", counts);

await queue.close();
await conn.quit();
