import { Queue } from "bullmq";
import IORedis from "ioredis";

/** Must match `apps/worker/src/queues/constants.ts`. */
export const FLEET_SYNC_QUEUE_NAME = "fleethub-fleet-sync";
export const WEBHOOK_INGEST_QUEUE_NAME = "fleethub-webhook-ingest";
export const TENANT_EXPORT_QUEUE_NAME = "fleethub-tenant-export";

export type BullMqQueueCounts = {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
};

export type FleetQueuesSnapshot = {
  available: boolean;
  fleetSync: BullMqQueueCounts;
  webhookIngest: BullMqQueueCounts;
  tenantExport: BullMqQueueCounts;
  /** Sum of waiting + delayed across queues (PROPUESTA §4.8 — reintentos pendientes). */
  retryPendingTotal: number;
};

const EMPTY_COUNTS: BullMqQueueCounts = {
  waiting: 0,
  active: 0,
  delayed: 0,
  failed: 0,
};

async function readQueueCounts(
  queueName: string,
  connection: IORedis,
): Promise<BullMqQueueCounts> {
  const queue = new Queue(queueName, { connection });
  try {
    const counts = await queue.getJobCounts("waiting", "active", "delayed", "failed");
    return {
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      delayed: counts.delayed ?? 0,
      failed: counts.failed ?? 0,
    };
  } finally {
    await queue.close();
  }
}

export async function getFleetQueuesSnapshot(): Promise<FleetQueuesSnapshot> {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    return {
      available: false,
      fleetSync: { ...EMPTY_COUNTS },
      webhookIngest: { ...EMPTY_COUNTS },
      tenantExport: { ...EMPTY_COUNTS },
      retryPendingTotal: 0,
    };
  }

  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  try {
    const [fleetSync, webhookIngest, tenantExport] = await Promise.all([
      readQueueCounts(FLEET_SYNC_QUEUE_NAME, connection),
      readQueueCounts(WEBHOOK_INGEST_QUEUE_NAME, connection),
      readQueueCounts(TENANT_EXPORT_QUEUE_NAME, connection),
    ]);

    const retryPendingTotal =
      fleetSync.waiting +
      fleetSync.delayed +
      webhookIngest.waiting +
      webhookIngest.delayed +
      tenantExport.waiting +
      tenantExport.delayed;

    return {
      available: true,
      fleetSync,
      webhookIngest,
      tenantExport,
      retryPendingTotal,
    };
  } finally {
    await connection.quit();
  }
}
