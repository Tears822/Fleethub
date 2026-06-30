/**
 * Force sync for a tenant slug (Uber + FreeNow). Usage: tsx src/cli/force-tenant-sync.ts cosculluela
 */
import "../load-env.js";
import { reconcileStaleSyncRuns } from "@fleethub/auth";
import { RidePlatform, withoutTenant } from "@fleethub/db";
import { createRedisConnection } from "../config/redis.js";
import { enqueuePlatformSyncJob } from "../lib/enqueue-platform-sync-job.js";

const slug = process.argv[2]?.trim();
if (!slug) {
  console.error("Usage: tsx src/cli/force-tenant-sync.ts <tenant-slug>");
  process.exit(1);
}

const tenant = await withoutTenant((tx) =>
  tx.tenant.findFirst({ where: { slug }, select: { id: true, name: true } }),
);
if (!tenant) {
  console.error("Tenant not found:", slug);
  process.exit(1);
}

console.log("Tenant:", tenant.name, tenant.id);

const { reconciled } = await reconcileStaleSyncRuns({ tenantId: tenant.id });
console.log("Reconciled stale RUNNING:", reconciled.length);

const conn = createRedisConnection();
for (const platform of [RidePlatform.UBER, RidePlatform.FREENOW]) {
  const jobId = await enqueuePlatformSyncJob(conn, tenant.id, platform, "manual");
  console.log("Enqueued", platform, jobId);
}
await conn.quit();

console.log("Waiting 90s for worker…");
await new Promise((r) => setTimeout(r, 90_000));

const recent = await withoutTenant((tx) =>
  tx.syncRun.findMany({
    where: { tenantId: tenant.id },
    orderBy: { startedAt: "desc" },
    take: 4,
    select: {
      platform: true,
      status: true,
      startedAt: true,
      finishedAt: true,
      errorMessage: true,
      cursorHint: true,
    },
  }),
);

for (const r of recent) {
  const hint = r.cursorHint as { tripsUpserted?: number } | null;
  console.log(
    r.platform,
    r.status,
    r.startedAt.toISOString(),
    hint?.tripsUpserted != null ? `${hint.tripsUpserted} trips` : "",
    r.errorMessage ?? "",
  );
}
