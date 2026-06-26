import { Queue } from "bullmq";
import type IORedis from "ioredis";

const QUEUE_NAME = "fleethub-default";

export async function runQueueSmokeCheck(connection: IORedis): Promise<void> {
  const queue = new Queue(QUEUE_NAME, { connection });
  const counts = await queue.getJobCounts(
    "waiting",
    "active",
    "completed",
    "failed"
  );
  console.log("[worker] Queue job counts:", counts);
  await queue.close();
}
