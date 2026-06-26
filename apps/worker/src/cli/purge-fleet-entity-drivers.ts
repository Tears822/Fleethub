/**
 * Remove driver rows that are fleet businesses (Uber org names, S.L., etc.) with no trips.
 *
 *   npm run purge:fleet-entity-drivers -w @fleethub/worker -- cosculluela
 *   npm run purge:fleet-entity-drivers -w @fleethub/worker -- cosculluela --dry-run
 */
import path from "node:path";
import { config } from "dotenv";
import { isLikelyFleetEntityDriverName } from "@fleethub/auth";
import { prisma, withTenant } from "@fleethub/db";
import { listUberOrganizations } from "../lib/uber-fleet-client.js";

config({ path: path.resolve(process.cwd(), "../../.env") });

async function main() {
  const tenantSlug = process.argv[2]?.trim();
  const dryRun = process.argv.includes("--dry-run");
  if (!tenantSlug) {
    console.error("Usage: purge-fleet-entity-drivers.ts <tenant-slug> [--dry-run]");
    process.exit(1);
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, slug: true },
  });
  if (!tenant) {
    console.error("Tenant not found:", tenantSlug);
    process.exit(1);
  }

  const orgs = await listUberOrganizations();
  const fleetOrgNames = orgs.ok ? orgs.data.map((o) => o.name ?? "").filter(Boolean) : [];

  const removed: string[] = [];

  await withTenant(tenant.id, async (tx) => {
    const companies = await tx.company.findMany({
      where: { tenantId: tenant.id },
      select: { legalName: true },
    });
    const referenceNames = [...fleetOrgNames, ...companies.map((c) => c.legalName)];

    const drivers = await tx.driver.findMany({
      where: { tenantId: tenant.id },
      select: {
        id: true,
        fullName: true,
        _count: { select: { trips: true, shiftLiquidations: true } },
      },
    });

    for (const driver of drivers) {
      if (!isLikelyFleetEntityDriverName(driver.fullName, referenceNames)) continue;
      if (driver._count.trips > 0 || driver._count.shiftLiquidations > 0) {
        console.warn("SKIP (has data):", driver.fullName);
        continue;
      }

      removed.push(driver.fullName);
      if (!dryRun) {
        await tx.driverPlatformAccount.deleteMany({ where: { driverId: driver.id } });
        await tx.driverVehicleAssignment.deleteMany({ where: { driverId: driver.id } });
        await tx.driverPlatformDayMetric.deleteMany({ where: { driverId: driver.id } });
        await tx.driver.delete({ where: { id: driver.id } });
      }
    }
  });

  console.log("Tenant:", tenant.slug);
  console.log("Dry run:", dryRun);
  console.log("Removed:", removed.length);
  for (const name of removed) console.log(" -", name);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
