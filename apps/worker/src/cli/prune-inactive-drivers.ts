/**
 * Delete inactive drivers (optional: only those without platform accounts).
 *
 *   npm run prune:inactive-drivers -w @fleethub/worker -- trevino --dry-run
 *   npm run prune:inactive-drivers -w @fleethub/worker -- trevino --empty-only
 */
import path from "node:path";
import { config } from "dotenv";
import { prisma, withoutTenant } from "@fleethub/db";

config({ path: path.resolve(process.cwd(), "../../.env") });

async function main() {
  const tenantSlug = process.argv[2]?.trim();
  const dryRun = process.argv.includes("--dry-run");
  const emptyOnly = process.argv.includes("--empty-only");

  if (!tenantSlug) {
    console.error("Usage: prune-inactive-drivers.ts <tenant-slug> [--dry-run] [--empty-only]");
    process.exit(1);
  }

  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true, name: true } }),
  );
  if (!tenant) {
    console.error("Tenant not found:", tenantSlug);
    process.exit(1);
  }

  const candidates = await withoutTenant((tx) =>
    tx.driver.findMany({
      where: {
        tenantId: tenant.id,
        isActive: false,
        ...(emptyOnly ? { driverPlatformAccounts: { none: {} } } : {}),
      },
      select: { id: true, fullName: true, _count: { select: { trips: true } } },
      orderBy: { fullName: "asc" },
    }),
  );

  console.log(`=== Prune inactive drivers — ${tenant.name} (${tenantSlug}) ===`);
  console.log("Dry run:", dryRun, "| empty-only:", emptyOnly);
  console.log("Candidates:", candidates.length);
  for (const d of candidates) {
    console.log(` - ${d.fullName} (${d._count.trips} trips)`);
  }

  if (!dryRun && candidates.length > 0) {
    await withoutTenant(
      (tx) => tx.driver.deleteMany({ where: { id: { in: candidates.map((d) => d.id) } } }),
      undefined,
      tenant.id,
    );
    console.log("Deleted:", candidates.length);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
