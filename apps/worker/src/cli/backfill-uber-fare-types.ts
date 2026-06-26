/**
 * Backfill Uber fare_type (Taxímetro vs T3) from Payments Order report columns.
 *
 * Usage:
 *   npx tsx src/cli/backfill-uber-fare-types.ts demo-a
 *   npx tsx src/cli/backfill-uber-fare-types.ts demo-a --dry-run
 */
import path from "node:path";
import { config } from "dotenv";
import { prisma, RidePlatform, withTenant } from "@fleethub/db";
import { isT3Fare } from "@fleethub/auth/shift-liquidation";
import { resolveUberOrgId } from "../lib/uber-fleet-client.js";
import { fetchUberPaymentsOrderRows } from "../lib/uber-reports.js";
import { mapUberPaymentsRowFareType } from "../lib/uber-payments-driver-mapper.js";
import { resolveTenantUberSyncDays } from "../lib/tenant-platform-config.js";
import { uberSyncRange } from "../lib/uber-sync-window.js";

config({ path: path.resolve(process.cwd(), "../../.env") });
config({ path: path.resolve(process.cwd(), ".env"), override: true });

async function main() {
  const tenantSlug = process.argv[2]?.trim();
  const dryRun = process.argv.includes("--dry-run");
  if (!tenantSlug) {
    console.error("Usage: backfill-uber-fare-types.ts <tenant-slug> [--dry-run]");
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

  const org = await resolveUberOrgId();
  if (!org.ok) {
    console.error("Uber org:", org.message);
    process.exit(1);
  }

  const to = new Date();
  const days = await resolveTenantUberSyncDays(tenant.id);
  const { from } = uberSyncRange(to, days);

  console.log("=== Backfill Uber fare types ===");
  console.log("Tenant:", tenant.slug);
  console.log("Window:", from.toISOString().slice(0, 10), "→", to.toISOString().slice(0, 10));
  console.log("Dry run:", dryRun);

  const report = await fetchUberPaymentsOrderRows(org.data, from, to);
  if (!report.ok) {
    console.error("Payments Order report failed:", report.message);
    process.exit(1);
  }

  const byExternalId = new Map<string, string>();
  for (const row of report.data) {
    const tripId = row["UUID del viaje"]?.trim() || row["Trip UUID"]?.trim();
    if (!tripId) continue;
    const fareType = mapUberPaymentsRowFareType(row);
    if (!fareType) continue;
    byExternalId.set(tripId, fareType);
  }

  console.log("Report rows:", report.data.length);
  console.log("Trips with fare type from report:", byExternalId.size);

  let updated = 0;
  let alreadyOk = 0;
  let notFound = 0;
  const stats = { t3: 0, meter: 0, other: 0 };

  await withTenant(tenant.id, async (tx) => {
    for (const [externalTripId, fareType] of byExternalId) {
      if (isT3Fare(fareType)) stats.t3 += 1;
      else if (fareType.toLowerCase().includes("taxímetro") || fareType.toLowerCase().includes("taximetro")) {
        stats.meter += 1;
      } else {
        stats.other += 1;
      }

      const trip = await tx.trip.findFirst({
        where: {
          tenantId: tenant.id,
          platform: RidePlatform.UBER,
          externalTripId,
        },
        select: { id: true, fareType: true },
      });
      if (!trip) {
        notFound += 1;
        continue;
      }
      if (trip.fareType === fareType) {
        alreadyOk += 1;
        continue;
      }
      if (!dryRun) {
        await tx.trip.update({
          where: { id: trip.id },
          data: { fareType },
        });
      }
      updated += 1;
    }
  });

  console.log("\nClassification from report:", stats);
  console.log("Updated:", updated, "| Already correct:", alreadyOk, "| Not in DB:", notFound);
  if (dryRun) console.log("(dry-run — no writes)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
