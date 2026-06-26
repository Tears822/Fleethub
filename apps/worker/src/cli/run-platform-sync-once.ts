/**
 * Run platform-sync inline (no BullMQ worker required).
 * Usage: npm run run-platform-sync -w @fleethub/worker -- demo-a FREENOW
 */
import path from "node:path";
import { config } from "dotenv";
import { prisma, RidePlatform } from "@fleethub/db";
import { processPlatformSyncJob } from "../jobs/process-platform-sync.js";

config({ path: path.resolve(process.cwd(), "../../.env") });
config({ path: path.resolve(process.cwd(), ".env"), override: true });

async function main() {
  const slug = process.argv[2]?.trim();
  const platformRaw = process.argv[3]?.trim().toUpperCase();
  if (!slug || !platformRaw) {
    console.error("Usage: run-platform-sync-once <tenant-slug> <UBER|FREENOW>");
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

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!tenant) {
    console.error("Tenant not found:", slug);
    process.exit(1);
  }

  await processPlatformSyncJob({
    id: "cli",
    data: { tenantId: tenant.id, platform },
  } as Parameters<typeof processPlatformSyncJob>[0]);

  const trips = await prisma.trip.count({
    where: { tenantId: tenant.id, platform },
  });
  const run = await prisma.syncRun.findFirst({
    where: { tenantId: tenant.id, platform },
    orderBy: { startedAt: "desc" },
  });
  console.log("Latest sync_run:", run?.status, run?.errorMessage ?? "");
  console.log("Total trips (%s):", platform, trips);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
