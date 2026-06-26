/**
 * Move BADAVI operational data from pilot tenant demo-a → production tenant cosculluela.
 *
 * Usage:
 *   npx tsx src/cli/migrate-badavi-to-cosculluela.ts --dry-run
 *   npx tsx src/cli/migrate-badavi-to-cosculluela.ts
 */
import path from "node:path";
import { config } from "dotenv";
import { Prisma, prisma } from "@fleethub/db";

config({ path: path.resolve(process.cwd(), "../../.env") });
config({ path: path.resolve(process.cwd(), ".env"), override: true });

const SOURCE_SLUG = "demo-a";
const TARGET_SLUG = "cosculluela";

function pickBadaviCompany(
  companies: { id: string; legalName: string }[],
): { id: string; legalName: string } | undefined {
  return companies.find((c) => /badavi/i.test(c.legalName));
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const source = await prisma.tenant.findUnique({
    where: { slug: SOURCE_SLUG },
    include: { companies: { select: { id: true, legalName: true } } },
  });
  const target = await prisma.tenant.findUnique({
    where: { slug: TARGET_SLUG },
    include: { companies: { select: { id: true, legalName: true } } },
  });

  if (!source || !target) {
    console.error("Missing tenant:", { source: SOURCE_SLUG, target: TARGET_SLUG });
    process.exit(1);
  }

  const sourceCompany = pickBadaviCompany(source.companies);
  const targetCompany = pickBadaviCompany(target.companies);
  if (!sourceCompany || !targetCompany) {
    console.error("BADAVI company not found", {
      sourceCompanies: source.companies.map((c) => c.legalName),
      targetCompanies: target.companies.map((c) => c.legalName),
    });
    process.exit(1);
  }

  const driverIds = (
    await prisma.driver.findMany({
      where: { tenantId: source.id },
      select: { id: true },
    })
  ).map((d) => d.id);

  const counts = {
    drivers: driverIds.length,
    trips: await prisma.trip.count({ where: { tenantId: source.id } }),
    shiftLiquidations: await prisma.shiftLiquidation.count({ where: { tenantId: source.id } }),
    platformAccounts: await prisma.driverPlatformAccount.count({ where: { tenantId: source.id } }),
    dayMetrics: await prisma.driverPlatformDayMetric.count({ where: { tenantId: source.id } }),
    syncRuns: await prisma.syncRun.count({ where: { tenantId: source.id } }),
    vehicleAssignments: await prisma.driverVehicleAssignment.count({ where: { tenantId: source.id } }),
  };

  console.log("=== Migrate BADAVI demo-a → cosculluela ===");
  console.log("Dry run:", dryRun);
  console.log("Source:", SOURCE_SLUG, source.id, "→ company:", sourceCompany.legalName);
  console.log("Target:", TARGET_SLUG, target.id, "→ company:", targetCompany.legalName);
  console.log("Rows to move:", counts);

  if (dryRun) {
    console.log("(dry-run — no writes)");
    return;
  }

  const sourceSettings = (source.settings ?? {}) as Record<string, unknown>;
  const targetSettings = (target.settings ?? {}) as Record<string, unknown>;
  const mergedSettings = {
    ...targetSettings,
    ...sourceSettings,
    integrations: {
      ...(targetSettings.integrations as object | undefined),
      ...(sourceSettings.integrations as object | undefined),
      freenowPublicCompanyId: "GEYTMOBQGE",
    },
    dataSource: "live",
  };

  await prisma.$transaction(async (tx) => {
    await tx.tenant.update({
      where: { id: target.id },
      data: { settings: mergedSettings as Prisma.InputJsonValue },
    });

    if (driverIds.length > 0) {
      await tx.driver.updateMany({
        where: { tenantId: source.id },
        data: { tenantId: target.id, companyId: targetCompany.id },
      });
      await tx.driverPlatformAccount.updateMany({
        where: { tenantId: source.id },
        data: { tenantId: target.id },
      });
      await tx.driverVehicleAssignment.updateMany({
        where: { tenantId: source.id },
        data: { tenantId: target.id },
      });
      await tx.trip.updateMany({
        where: { tenantId: source.id },
        data: { tenantId: target.id },
      });
      await tx.shiftLiquidation.updateMany({
        where: { tenantId: source.id },
        data: { tenantId: target.id },
      });
      await tx.driverPlatformDayMetric.updateMany({
        where: { tenantId: source.id },
        data: { tenantId: target.id },
      });
      await tx.syncRun.updateMany({
        where: { tenantId: source.id },
        data: { tenantId: target.id },
      });
      await tx.ingestionEvent.updateMany({
        where: { tenantId: source.id },
        data: { tenantId: target.id },
      });
    }
  });

  const after = {
    sourceDrivers: await prisma.driver.count({ where: { tenantId: source.id } }),
    sourceTrips: await prisma.trip.count({ where: { tenantId: source.id } }),
    targetDrivers: await prisma.driver.count({ where: { tenantId: target.id } }),
    targetTrips: await prisma.trip.count({ where: { tenantId: target.id } }),
    targetLiquidations: await prisma.shiftLiquidation.count({ where: { tenantId: target.id } }),
  };

  console.log("Done.", after);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
