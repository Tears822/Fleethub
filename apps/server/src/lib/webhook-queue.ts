import { Queue } from "bullmq";
import IORedis from "ioredis";

export const WEBHOOK_INGEST_QUEUE_NAME = "fleethub-webhook-ingest";

export type WebhookIngestJobData = {
  tenantId: string;
  tenantSlug: string;
  platform: "uber" | "freenow";
  eventType: string | null;
  receivedAt: string;
  /** Full webhook JSON (capped when enqueued). */
  bodyJson: string;
};

export function isWebhookEnqueueEnabled(): boolean {
  const v = process.env.WEBHOOK_ENQUEUE_ENABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export async function enqueueWebhookIngestJob(
  data: WebhookIngestJobData,
): Promise<string | null> {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl || !isWebhookEnqueueEnabled()) {
    return null;
  }

  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue(WEBHOOK_INGEST_QUEUE_NAME, { connection });
  try {
    const job = await queue.add("webhook-ingest", data, {
      attempts: 3,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    });
    return job.id ?? null;
  } finally {
    await queue.close();
    await connection.quit();
  }
}
