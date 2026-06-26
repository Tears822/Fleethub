/**
 * Remove FreeNow drivers cloned into the wrong tenant (shared umbrella token).
 *
 * Usage:
 *   npm run purge:freenow-clones -w @fleethub/worker -- --dry-run
 *   npm run purge:freenow-clones -w @fleethub/worker -- trevino trade-taxi-sl
 */
import path from "node:path";
import { config } from "dotenv";
import { prisma, RidePlatform } from "@fleethub/db";

config({ path: path.resolve(process.cwd(), "../../.env") });

const GROUP_SLUGS = ["cosculluela", "trevino", "trade-taxi-sl"] as const;

type DpaRow = {
  tenantId: string;
  slug: string;
  dpaId: string;
  driverId: string;
  source: string;
};

function dpaSource(metadata: unknown): string {
  if (metadata && typeof metadata === "object" && "source" in metadata) {
    return String((metadata as { source?: unknown }).source ?? "").trim();
  }
  return "";
}

function canonicalRow(rows: DpaRow[]): DpaRow {
  const score = (r: DpaRow): number => {
    if (r.source === "group_spreadsheet") return 100;
    if (r.source === "freenow_realign") return 55;
    if (r.source && r.source !== "freenow_import") return 70;
    if (r.slug === "cosculluela") return 60;
    if (r.slug === "trade-taxi-sl") return 40;
    return 20;
  };
  return rows.reduce((best, r) => (score(r) > score(best) ? r : best));
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const tenantArgs = process.argv
    .slice(2)
    .filter((a) => a !== "--dry-run")
    .map((s) => s.trim())
    .filter(Boolean);

  const purgeSlugs =
    tenantArgs.length > 0 ? tenantArgs : [...GROUP_SLUGS.filter((s) => s !== "cosculluela")];

  const allGroupTenants = await prisma.tenant.findMany({
    where: { slug: { in: [...GROUP_SLUGS] } },
    select: { id: true, slug: true },
  });
  const purgeTenantIds = new Set(
    allGroupTenants.filter((t) => purgeSlugs.includes(t.slug)).map((t) => t.id),
  );

  const byExternal = new Map<string, DpaRow[]>();

  for (const tenant of allGroupTenants) {
    const rows = await prisma.driverPlatformAccount.findMany({
      where: {
        tenantId: tenant.id,
        platform: RidePlatform.FREENOW,
        isActive: true,
        externalDriverId: { not: { startsWith: "seed-" } },
      },
      select: { id: true, externalDriverId: true, driverId: true, metadata: true },
    });
    for (const row of rows) {
      const ext = row.externalDriverId.trim().toUpperCase();
      const list = byExternal.get(ext) ?? [];
      list.push({
        tenantId: tenant.id,
        slug: tenant.slug,
        dpaId: row.id,
        driverId: row.driverId,
        source: dpaSource(row.metadata),
      });
      byExternal.set(ext, list);
    }
  }

  const clones: Array<{
    externalDriverId: string;
    canonicalSlug: string;
    removeSlug: string;
    driverId: string;
    dpaId: string;
    tenantId: string;
    source: string;
  }> = [];

  for (const [ext, rows] of byExternal) {
    if (rows.length < 2) continue;
    const canonical = canonicalRow(rows);
    for (const row of rows) {
      if (row.dpaId === canonical.dpaId) continue;
      if (!purgeTenantIds.has(row.tenantId)) continue;
      if (row.source === "group_spreadsheet") continue;
      if (canonical.source === "group_spreadsheet" || canonical.source === "freenow_realign") {
        clones.push({
          externalDriverId: ext,
          canonicalSlug: canonical.slug,
          removeSlug: row.slug,
          driverId: row.driverId,
          dpaId: row.dpaId,
          tenantId: row.tenantId,
          source: row.source,
        });
      }
    }
  }

  console.log(
    dryRun ? "=== DRY RUN purge freenow tenant clones ===" : "=== Purge freenow tenant clones ===",
  );
  console.log(`Clone rows to remove: ${clones.length}`);

  let deactivatedDrivers = 0;
  let deactivatedDpas = 0;
  let deletedPendingTrips = 0;

  for (const clone of clones) {
    const driver = await prisma.driver.findUnique({
      where: { id: clone.driverId },
      select: { fullName: true },
    });
    const pendingCount = await prisma.trip.count({
      where: {
        tenantId: clone.tenantId,
        driverId: clone.driverId,
        liquidationStatus: "pending",
      },
    });
    console.log(
      `  ${clone.removeSlug}: ${driver?.fullName ?? clone.driverId} (${clone.externalDriverId}, ${clone.source}) → keep in ${clone.canonicalSlug}, pending ${pendingCount}`,
    );

    if (dryRun) {
      deactivatedDrivers += 1;
      deactivatedDpas += 1;
      deletedPendingTrips += pendingCount;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const del = await tx.trip.deleteMany({
        where: {
          tenantId: clone.tenantId,
          driverId: clone.driverId,
          liquidationStatus: "pending",
        },
      });
      deletedPendingTrips += del.count;

      await tx.driverPlatformAccount.update({
        where: { id: clone.dpaId },
        data: { isActive: false },
      });
      deactivatedDpas += 1;

      await tx.driver.update({
        where: { id: clone.driverId },
        data: { isActive: false },
      });
      deactivatedDrivers += 1;
    });
  }

  console.log(
    `\nDone: drivers deactivated=${deactivatedDrivers}, dpas deactivated=${deactivatedDpas}, pending trips deleted=${deletedPendingTrips}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
