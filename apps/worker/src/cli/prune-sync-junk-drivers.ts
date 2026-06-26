/**
 * Deactivate drivers created by platform sync without DNI and without trips
 * (duplicates / noise not present in the client Excel).
 *
 *   npm run prune:sync-junk-drivers -w @fleethub/worker -- cosculluela --dry-run
 *   npm run prune:sync-junk-drivers -w @fleethub/worker -- cosculluela
 */
import path from "node:path";
import { config } from "dotenv";
import { prisma, withoutTenant } from "@fleethub/db";

config({ path: path.resolve(process.cwd(), "../../.env") });

async function main() {
  const tenantSlug = process.argv[2]?.trim();
  const dryRun = process.argv.includes("--dry-run");

  if (!tenantSlug) {
    console.error("Usage: prune-sync-junk-drivers.ts <tenant-slug> [--dry-run]");
    process.exit(1);
  }

  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true, name: true } }),
  );
  if (!tenant) {
    console.error("Tenant not found:", tenantSlug);
    process.exit(1);
  }

  const junk = await withoutTenant((tx) =>
    tx.driver.findMany({
      where: {
        tenantId: tenant.id,
        isActive: true,
        OR: [{ dni: null }, { dni: "" }],
        trips: { none: {} },
      },
      select: {
        id: true,
        fullName: true,
        company: { select: { legalName: true } },
      },
      orderBy: { fullName: "asc" },
    }),
  );

  console.log(`=== Prune sync junk drivers — ${tenant.name} (${tenantSlug}) ===`);
  console.log("Dry run:", dryRun);
  console.log("Candidates:", junk.length);

  for (const d of junk) {
    console.log(` - ${d.fullName} | ${d.company.legalName}`);
  }

  if (!dryRun && junk.length > 0) {
    await withoutTenant((tx) =>
      tx.driver.updateMany({
        where: { id: { in: junk.map((d) => d.id) } },
        data: { isActive: false },
      }),
    );
    console.log("Deactivated:", junk.length);
  }

  const active = await withoutTenant((tx) =>
    tx.driver.count({ where: { tenantId: tenant.id, isActive: true } }),
  );
  console.log("Active drivers now:", active);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
