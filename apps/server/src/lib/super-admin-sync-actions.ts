import { reconcileStaleSyncRuns } from "@fleethub/auth";
import { RidePlatform, withoutTenant } from "@fleethub/db";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import {
  enqueuePlatformSyncJobs,
  FLEET_SYNC_QUEUE_NAME,
  resolveSyncPlatforms,
} from "./fleet-sync-queue.js";

function tenantIdFromJob(job: { id?: string; data?: { tenantId?: string } }): string | null {
  if (typeof job.data?.tenantId === "string") return job.data.tenantId;
  const m = /^platform-sync:([^:]+):/.exec(String(job.id ?? ""));
  return m?.[1] ?? null;
}

/** Drop failed/waiting/delayed jobs whose tenant no longer exists (avoids FK errors on retry). */
export async function purgeOrphanFleetSyncJobs(limit = 200): Promise<number> {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) return 0;

  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue(FLEET_SYNC_QUEUE_NAME, { connection });
  let removed = 0;
  try {
    const tenantCache = new Map<string, boolean>();
    async function tenantExists(tenantId: string): Promise<boolean> {
      const cached = tenantCache.get(tenantId);
      if (cached !== undefined) return cached;
      const row = await withoutTenant((tx) =>
        tx.tenant.findUnique({ where: { id: tenantId }, select: { id: true } }),
      );
      const ok = Boolean(row);
      tenantCache.set(tenantId, ok);
      return ok;
    }

    for (const state of ["failed", "waiting", "delayed"] as const) {
      const jobs =
        state === "failed"
          ? await queue.getFailed(0, limit)
          : state === "waiting"
            ? await queue.getWaiting(0, limit)
            : await queue.getDelayed(0, limit);

      for (const job of jobs) {
        const tenantId = tenantIdFromJob(job);
        if (!tenantId) continue;
        if (await tenantExists(tenantId)) continue;
        await job.remove();
        removed += 1;
      }
    }
    return removed;
  } finally {
    await queue.close();
    await connection.quit();
  }
}

export async function superAdminForceTenantSync(
  tenantId: string,
  input?: { platform?: unknown; all?: boolean },
): Promise<{ jobIds: string[]; platforms: RidePlatform[]; reconciled: number }> {
  const { reconciled } = await reconcileStaleSyncRuns({ tenantId });
  const platforms = resolveSyncPlatforms({
    platform: input?.platform,
    all: input?.all === true,
  });
  const jobIds = await enqueuePlatformSyncJobs(tenantId, platforms);
  return { jobIds, platforms, reconciled: reconciled.length };
}

export async function superAdminReconcileStaleSyncs(input?: {
  tenantId?: string;
  platform?: RidePlatform;
}): Promise<{ reconciled: number; enqueued: number }> {
  const { reconciled } = await reconcileStaleSyncRuns({
    tenantId: input?.tenantId,
    platform: input?.platform,
  });

  let enqueued = 0;
  if (reconciled.length > 0) {
    const seen = new Set<string>();
    for (const row of reconciled) {
      const key = `${row.tenantId}:${row.platform}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const jobIds = await enqueuePlatformSyncJobs(row.tenantId, [row.platform]);
      enqueued += jobIds.length;
    }
  }

  return { reconciled: reconciled.length, enqueued };
}

export async function superAdminRetryFailedFleetSyncJobs(limit = 50): Promise<number> {
  await purgeOrphanFleetSyncJobs(200);

  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    throw new Error("REDIS_URL no configurado");
  }

  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue(FLEET_SYNC_QUEUE_NAME, { connection });
  try {
    const failed = await queue.getFailed(0, Math.max(1, Math.min(limit, 200)));
    let retried = 0;
    for (const job of failed) {
      try {
        await job.retry();
        retried += 1;
      } catch {
        // skip jobs that cannot be retried
      }
    }
    return retried;
  } finally {
    await queue.close();
    await connection.quit();
  }
}
