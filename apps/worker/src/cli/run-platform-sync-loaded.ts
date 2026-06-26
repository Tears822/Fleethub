/**
 * Run platform-sync with load-env (fixes prisma init order).
 * Usage: npx tsx src/cli/run-with-worker-uber-env.ts src/cli/run-platform-sync-loaded.ts trevino UBER
 */
import "../load-env.js";
import { prisma, RidePlatform, withoutTenant } from "@fleethub/db";
import { processPlatformSyncJob } from "../jobs/process-platform-sync.js";

async function main() {
  const slug = process.argv[2]?.trim();
  const platformRaw = process.argv[3]?.trim().toUpperCase();
  if (!slug || !platformRaw) {
    console.error("Usage: run-platform-sync-loaded.ts <tenant-slug> <UBER|FREENOW>");
    process.exit(1);
  }
  const platform =
    platformRaw === "UBER"
      ? RidePlatform.UBER
      : platformRaw === "FREENOW"
        ? RidePlatform.FREENOW
        : null;
  if (!platform) {
    console.error("Platform must be UBER or FREENOW");
    process.exit(1);
  }

  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({
      where: { slug },
      select: { id: true, slug: true },
    }),
  );
  if (!tenant) {
    console.error("Tenant not found:", slug);
    process.exit(1);
  }

  console.log(`=== platform-sync ${tenant.slug} ${platform} ===`);
  await processPlatformSyncJob({
    id: "cli",
    data: { tenantId: tenant.id, platform, trigger: "manual" },
  } as Parameters<typeof processPlatformSyncJob>[0]);

  const trips = await withoutTenant(
    (tx) => tx.trip.count({ where: { tenantId: tenant.id, platform } }),
    undefined,
    tenant.id,
  );
  const pending = await withoutTenant(
    (tx) =>
      tx.trip.count({
        where: { tenantId: tenant.id, platform, liquidationStatus: "pending" },
      }),
    undefined,
    tenant.id,
  );
  const run = await withoutTenant(
    (tx) =>
      tx.syncRun.findFirst({
        where: { tenantId: tenant.id, platform },
        orderBy: { startedAt: "desc" },
      }),
    undefined,
    tenant.id,
  );
  console.log("Latest sync_run:", run?.status, run?.errorMessage ?? "");
  console.log(`Trips ${platform}: total=${trips} pending=${pending}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
