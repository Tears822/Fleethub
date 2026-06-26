/**
 * Backfill FreeNow fare_type from getCompanyBookings subFleetTypeLabel.
 *
 * Usage:
 *   npx tsx src/cli/backfill-freenow-fare-types.ts demo-a
 *   npx tsx src/cli/backfill-freenow-fare-types.ts demo-a --days 28
 *   npx tsx src/cli/backfill-freenow-fare-types.ts demo-a --dry-run
 */
import path from "node:path";
import { config } from "dotenv";
import { prisma, RidePlatform, withTenant } from "@fleethub/db";
import { isT3Fare } from "@fleethub/auth/shift-liquidation";
import { listFreenowCompanyBookings } from "../lib/freenow-bookings.js";
import { mapFreenowFareType } from "../lib/freenow-fare-type.js";
import { resolveTenantFreenowPublicCompanyId } from "../lib/tenant-platform-config.js";
import { uberSyncRange } from "../lib/uber-sync-window.js";

config({ path: path.resolve(process.cwd(), "../../.env") });
config({ path: path.resolve(process.cwd(), ".env"), override: true });

async function main() {
  const tenantSlug = process.argv[2]?.trim();
  const dryRun = process.argv.includes("--dry-run");
  const daysArg = process.argv.find((a) => a.startsWith("--days="))?.slice("--days=".length);
  const daysFlagIdx = process.argv.indexOf("--days");
  const daysFromFlag =
    daysFlagIdx >= 0 ? Number(process.argv[daysFlagIdx + 1]) : Number.NaN;
  const syncDays = Number.isFinite(Number(daysArg))
    ? Math.min(28, Math.max(1, Math.round(Number(daysArg))))
    : Number.isFinite(daysFromFlag)
      ? Math.min(28, Math.max(1, Math.round(daysFromFlag)))
      : 28;
  if (!tenantSlug) {
    console.error(
      "Usage: backfill-freenow-fare-types.ts <tenant-slug> [--days 28] [--dry-run]",
    );
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

  const publicCompanyId = await resolveTenantFreenowPublicCompanyId(tenant.id);
  if (!publicCompanyId) {
    console.error("No FreeNow publicCompanyId for tenant");
    process.exit(1);
  }

  const to = new Date();
  const { from } = uberSyncRange(to, syncDays);

  console.log("=== Backfill FreeNow fare types ===");
  console.log("Tenant:", tenant.slug, "| company:", publicCompanyId);
  console.log("Window:", from.toISOString().slice(0, 10), "→", to.toISOString().slice(0, 10), `(${syncDays}d)`);
  console.log("Dry run:", dryRun);

  const bookings = await listFreenowCompanyBookings({ publicCompanyId, from, to });
  if (!bookings.ok) {
    console.error("getCompanyBookings failed:", bookings.message);
    process.exit(1);
  }

  const accomplished = bookings.bookings.filter((b) => b.state === "ACCOMPLISHED");
  const labelStats = new Map<string, number>();
  const byExternalId = new Map<string, string>();

  for (const b of accomplished) {
    const label = b.subFleetTypeLabel?.trim() || "(sin label)";
    labelStats.set(label, (labelStats.get(label) ?? 0) + 1);
    const raw = b as {
      subFleetTypeId?: string | null;
      fixedFare?: boolean | null;
    };
    const fareType = mapFreenowFareType(
      b.hailingType,
      b.subFleetTypeLabel,
      raw.subFleetTypeId,
      raw.fixedFare,
    );
    if (!fareType || !b.id?.trim()) continue;
    byExternalId.set(b.id.trim(), fareType);
  }

  console.log("Bookings ACCOMPLISHED:", accomplished.length);
  console.log("subFleetTypeLabel distribution:", Object.fromEntries(labelStats));
  console.log("Mapped trips:", byExternalId.size);

  let updated = 0;
  let alreadyOk = 0;
  let notFound = 0;
  const stats = { t3: 0, meter: 0, other: 0 };

  await withTenant(tenant.id, async (tx) => {
    for (const [externalTripId, fareType] of byExternalId) {
      if (isT3Fare(fareType)) stats.t3 += 1;
      else if (
        fareType.toLowerCase().includes("taxímetro") ||
        fareType.toLowerCase().includes("taximetro")
      ) {
        stats.meter += 1;
      } else {
        stats.other += 1;
      }

      const trip = await tx.trip.findFirst({
        where: {
          tenantId: tenant.id,
          platform: RidePlatform.FREENOW,
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

  console.log("\nClassification:", stats);
  console.log("Updated:", updated, "| Already correct:", alreadyOk, "| Not in DB:", notFound);
  if (dryRun) console.log("(dry-run — no writes)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
