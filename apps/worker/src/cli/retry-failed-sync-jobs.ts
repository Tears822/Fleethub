import "../load-env.js";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { FLEET_SYNC_QUEUE_NAME } from "../queues/constants.js";

const conn = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
const q = new Queue(FLEET_SYNC_QUEUE_NAME, { connection: conn });
const failed = await q.getFailed(0, 50);
console.log("failed count", failed.length);
let retried = 0;
for (const job of failed) {
  try {
    await job.retry();
    retried += 1;
  } catch (e) {
    console.log("skip", job.id, String(e));
  }
}
console.log("retried", retried);
console.log("counts", await q.getJobCounts("waiting", "active", "delayed", "failed"));
await q.close();
await conn.quit();
