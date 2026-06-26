/**
 * Remove orphan BADAVI clone driver rows left in trevino after uber purge.
 * Usage: npx tsx src/cli/run-with-worker-uber-env.ts src/cli/purge-trevino-orphan-drivers.ts [--dry-run]
 */
import "../load-env.js";
import { withoutTenant } from "@fleethub/db";

const ORPHAN_NAMES = ["RACHID KHADIR ZARIR", "SAMER KABBANI RAHIMA"];

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug: "trevino" }, select: { id: true } }),
  );
  if (!tenant) throw new Error("trevino not found");

  console.log(dryRun ? "=== DRY RUN purge trevino orphans ===" : "=== Purge trevino orphans ===");

  for (const fullName of ORPHAN_NAMES) {
    const driver = await withoutTenant(
      (tx) =>
        tx.driver.findFirst({
          where: { tenantId: tenant.id, fullName: { equals: fullName, mode: "insensitive" } },
          select: {
            id: true,
            fullName: true,
            isActive: true,
            driverPlatformAccounts: {
              select: { id: true, platform: true, isActive: true, externalDriverId: true },
            },
          },
        }),
      undefined,
      tenant.id,
    );
    if (!driver) {
      console.log(`  skip ${fullName} (not found)`);
      continue;
    }
    const activePlatforms = driver.driverPlatformAccounts.filter((a) => a.isActive);
    if (activePlatforms.length > 0) {
      console.log(`  skip ${fullName} — still has active platform link(s)`);
      continue;
    }
    console.log(
      `  delete ${driver.fullName} (inactive, ${driver.driverPlatformAccounts.length} inactive DPA)`,
    );
    if (dryRun) continue;

    await withoutTenant(
      async (tx) => {
        await tx.trip.deleteMany({ where: { tenantId: tenant.id, driverId: driver.id } });
        await tx.driverPlatformAccount.deleteMany({ where: { driverId: driver.id } });
        await tx.driver.delete({ where: { id: driver.id } });
      },
      undefined,
      tenant.id,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
