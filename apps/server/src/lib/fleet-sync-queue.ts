import { Queue } from "bullmq";
import IORedis from "ioredis";
import { RidePlatform } from "@fleethub/db";

/** Must match `apps/worker/src/queues/constants.ts`. */
export const FLEET_SYNC_QUEUE_NAME = "fleethub-fleet-sync";

const DEFAULT_POLL_PLATFORMS = [RidePlatform.UBER, RidePlatform.FREENOW] as const;

/** Manual «todas»: solo plataformas con conector operativo (Bolt/Cabify pendientes). */
const ALL_SYNC_PLATFORMS = [...DEFAULT_POLL_PLATFORMS] as const;

const OPERATIONAL_SYNC_PLATFORMS = new Set<RidePlatform>([
  RidePlatform.UBER,
  RidePlatform.FREENOW,
]);

function operationalOnly(platforms: RidePlatform[]): RidePlatform[] {
  return platforms.filter((p) => OPERATIONAL_SYNC_PLATFORMS.has(p));
}

function parseSyncPlatform(raw: unknown): RidePlatform | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toUpperCase();
  if (value in RidePlatform) return value as RidePlatform;
  return null;
}

export function resolveSyncPlatforms(input?: {
  platform?: unknown;
  all?: boolean;
}): RidePlatform[] {
  if (input?.all) return operationalOnly([...ALL_SYNC_PLATFORMS]);
  const one = parseSyncPlatform(input?.platform);
  if (one) return operationalOnly([one]);
  return operationalOnly([...DEFAULT_POLL_PLATFORMS]);
}

export function platformSyncLabel(platforms: RidePlatform[]): string {
  if (
    platforms.length === ALL_SYNC_PLATFORMS.length &&
    ALL_SYNC_PLATFORMS.every((p) => platforms.includes(p))
  ) {
    return "Uber y FreeNow";
  }
  if (platforms.length === 1) {
    const p = platforms[0]!;
    if (p === RidePlatform.UBER) return "Uber";
    if (p === RidePlatform.FREENOW) return "FreeNow";
    if (p === RidePlatform.BOLT) return "Bolt";
    return "Cabify";
  }
  return "Uber y FreeNow";
}

export async function enqueuePlatformSyncJobs(
  tenantId: string,
  platforms: RidePlatform[],
): Promise<string[]> {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    throw new Error("REDIS_URL no configurado");
  }

  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue(FLEET_SYNC_QUEUE_NAME, { connection });
  try {
    const jobIds: string[] = [];
    for (const platform of platforms) {
      const job = await queue.add(
        "platform-sync",
        { tenantId, platform, trigger: "manual" },
        { attempts: 3, backoff: { type: "exponential", delay: 5000 } },
      );
      if (job.id) jobIds.push(job.id);
    }
    return jobIds;
  } finally {
    await queue.close();
    await connection.quit();
  }
}

/** Manual poll default: Uber + FreeNow (dashboard «Más actual»). */
export async function enqueueTenantPlatformSync(tenantId: string): Promise<string[]> {
  return enqueuePlatformSyncJobs(tenantId, [...DEFAULT_POLL_PLATFORMS]);
}

export type FleetSyncQueueStats = {
  available: boolean;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
};

export async function getFleetSyncQueueStats(): Promise<FleetSyncQueueStats> {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    return { available: false, waiting: 0, active: 0, delayed: 0, failed: 0 };
  }

  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue(FLEET_SYNC_QUEUE_NAME, { connection });
  try {
    const counts = await queue.getJobCounts("waiting", "active", "delayed", "failed");
    return {
      available: true,
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      delayed: counts.delayed ?? 0,
      failed: counts.failed ?? 0,
    };
  } finally {
    await queue.close();
    await connection.quit();
  }
}
