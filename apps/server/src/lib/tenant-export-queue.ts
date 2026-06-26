import path from "node:path";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import type { CompanyScope } from "@fleethub/auth/tenant-scope";

/** Must match `apps/worker/src/queues/constants.ts`. */
export const TENANT_EXPORT_QUEUE_NAME = "fleethub-tenant-export";

export type TenantExportJobData = {
  kind: "trips-csv";
  tenantId: string;
  scope: CompanyScope;
};

export type TenantExportJobResult = {
  filePath: string;
  rowCount: number;
  filename: string;
};

export function tenantExportDataDir(): string {
  return process.env.EXPORT_DATA_DIR?.trim() || "/tmp/fleethub-exports";
}

export function tenantExportFilePath(jobId: string): string {
  return path.join(tenantExportDataDir(), `${jobId}-viajes.csv`);
}

export async function enqueueTenantTripsExport(
  tenantId: string,
  scope: CompanyScope,
): Promise<string> {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    throw new Error("REDIS_URL no configurado");
  }

  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue(TENANT_EXPORT_QUEUE_NAME, { connection });
  try {
    const job = await queue.add(
      "trips-csv",
      { kind: "trips-csv", tenantId, scope } satisfies TenantExportJobData,
      {
        attempts: 2,
        backoff: { type: "exponential", delay: 3000 },
        removeOnComplete: { age: 3600, count: 50 },
        removeOnFail: { age: 86400, count: 20 },
      },
    );
    if (!job.id) throw new Error("No se pudo crear el trabajo de exportación");
    return job.id;
  } finally {
    await queue.close();
    await connection.quit();
  }
}

export async function getTenantExportJob(jobId: string) {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) return null;

  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue(TENANT_EXPORT_QUEUE_NAME, { connection });
  try {
    return queue.getJob(jobId);
  } finally {
    await queue.close();
    await connection.quit();
  }
}
