/**
 * Backfill Uber trip amounts from Payments Driver report + earners/payments API.
 *
 * Usage:
 *   npm run backfill:uber-payments -w @fleethub/worker -- demo-a
 *   npm run backfill:uber-payments -w @fleethub/worker -- demo-a --dry-run
 */
import path from "node:path";
import { config } from "dotenv";
import { upsertNormalizedTripsForDriver } from "@fleethub/auth";
import { lookupTenantIdBySlug, RidePlatform, withTenant } from "@fleethub/db";
import { uberConnector } from "../connectors/uber.connector.js";
import { prefetchUberOrgReports } from "../lib/uber-reports.js";
import { resolveTenantUberSyncDays } from "../lib/tenant-platform-config.js";
import { uberSyncRange } from "../lib/uber-sync-window.js";

config({ path: path.resolve(process.cwd(), "../../.env") });
config({ path: path.resolve(process.cwd(), ".env"), override: true });

async function main() {
  const tenantSlug = process.argv[2]?.trim();
  const dryRun = process.argv.includes("--dry-run");
  if (!tenantSlug) {
    console.error("Usage: backfill:uber-payments <tenant-slug> [--dry-run]");
    process.exit(1);
  }

  const tenantId = await lookupTenantIdBySlug(tenantSlug);
  if (!tenantId) {
    console.error("Tenant not found:", tenantSlug);
    process.exit(1);
  }
  const tenant = { id: tenantId, slug: tenantSlug };

  const to = new Date();
  const days = await resolveTenantUberSyncDays(tenant.id);
  const { from } = uberSyncRange(to, days);

  await prefetchUberOrgReports(tenant.id, from, to);

  const dpas = await withTenant(tenant.id, (tx) =>
    tx.driverPlatformAccount.findMany({
      where: { tenantId: tenant.id, platform: RidePlatform.UBER, isActive: true },
      select: { id: true, driverId: true, externalDriverId: true },
    }),
  );

  let updated = 0;
  let skipped = 0;

  for (const dpa of dpas) {
    if (dpa.externalDriverId.startsWith("seed-")) continue;

    const trips = await uberConnector.syncTrips({
      tenantId: tenant.id,
      driverPlatformAccountId: dpa.id,
      from,
      to,
    });
    const withAmounts = trips.filter(
      (t) =>
        (t.grossAmountCents != null && t.grossAmountCents > 0n) ||
        (t.netAmountCents != null && t.netAmountCents > 0n),
    );
    if (withAmounts.length === 0) {
      skipped += 1;
      continue;
    }

    if (dryRun) {
      console.log(
        `[dry-run] ${dpa.externalDriverId.slice(0, 8)}… → ${withAmounts.length}/${trips.length} trip(s) with amounts`,
      );
      updated += withAmounts.length;
      continue;
    }

    const result = await upsertNormalizedTripsForDriver(
      tenant.id,
      dpa.id,
      dpa.driverId,
      RidePlatform.UBER,
      trips,
      "reconcile",
    );
    updated += result.updated;
    console.log(
      `[backfill] ${dpa.externalDriverId.slice(0, 8)}… upserted ${result.upserted} (${withAmounts.length} with amounts)`,
    );
  }

  const remaining = await withTenant(tenant.id, (tx) =>
    tx.trip.count({
      where: {
        tenantId: tenant.id,
        platform: RidePlatform.UBER,
        startedAt: { gte: from, lte: to },
        grossAmountCents: null,
        netAmountCents: null,
      },
    }),
  );

  console.log(
    `\nDone ${tenant.slug}: drivers processed=${dpas.length}, skipped=${skipped}, trips touched≈${updated}, still without amounts=${remaining}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
