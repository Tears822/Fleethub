import { Worker } from "bullmq";
import type IORedis from "ioredis";
import { processTenantExportJob } from "../jobs/process-tenant-export.js";
import { TENANT_EXPORT_QUEUE_NAME } from "./constants.js";

export function createTenantExportWorker(connection: IORedis): Worker {
  const concurrency = Math.max(1, Number(process.env.WORKER_EXPORT_CONCURRENCY ?? "1") || 1);
  return new Worker(TENANT_EXPORT_QUEUE_NAME, processTenantExportJob, {
    connection,
    concurrency,
  });
}
