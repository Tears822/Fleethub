import { Worker } from "bullmq";
import type IORedis from "ioredis";
import { processWebhookIngestJob } from "../jobs/process-webhook-ingest.js";
import { WEBHOOK_INGEST_QUEUE_NAME } from "./constants.js";

export function createWebhookIngestWorker(connection: IORedis): Worker {
  return new Worker(WEBHOOK_INGEST_QUEUE_NAME, processWebhookIngestJob, { connection });
}
