/**
 * Backfill Uber trip times for BADAVI: subtract 1h when CSV parser stored UTC+1 (ms=0).
 * Skips trips already manually corrected.
 */
import "../load-env.js";
import { RidePlatform, withTenant, withoutTenant } from "@fleethub/db";

const HOUR_MS = 3_600_000;
const ALREADY_FIXED = new Set([
  "5e54915a-3a67-44f4-a6d6-f5bb737c76da",
  "16fed175-e652-4261-9dcf-bf1a62d7f5c8",
  "20f47ed2-3461-443d-9afe-ebdb5ee743e0",
]);

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug: "cosculluela" }, select: { id: true } }),
  );
  if (!tenant) throw new Error("no tenant");

  const badavi = await withTenant(tenant.id, (tx) =>
    tx.company.findFirst({
      where: { tenantId: tenant.id, legalName: { contains: "BADAVI", mode: "insensitive" } },
      select: { id: true, legalName: true },
    }),
  );
  if (!badavi) throw new Error("BADAVI company not found");

  const trips = await withTenant(tenant.id, (tx) =>
    tx.trip.findMany({
      where: {
        tenantId: tenant.id,
        platform: RidePlatform.UBER,
        ingestSource: "poll_fallback",
        driver: { companyId: badavi.id },
        startedAt: { gte: new Date("2026-06-01T00:00:00Z") },
      },
      select: {
        id: true,
        externalTripId: true,
        startedAt: true,
        endedAt: true,
        grossAmountCents: true,
        driver: { select: { fullName: true } },
      },
    }),
  );

  let fixed = 0;
  let skipped = 0;

  for (const trip of trips) {
    if (ALREADY_FIXED.has(trip.externalTripId)) {
      skipped += 1;
      continue;
    }
    if (trip.startedAt.getUTCMilliseconds() !== 0) {
      skipped += 1;
      continue;
    }

    const before = trip.startedAt.toLocaleString("es-ES", {
      timeZone: "Europe/Madrid",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    const startedAt = new Date(trip.startedAt.getTime() - HOUR_MS);
    const endedAt = trip.endedAt ? new Date(trip.endedAt.getTime() - HOUR_MS) : startedAt;
    const after = startedAt.toLocaleString("es-ES", {
      timeZone: "Europe/Madrid",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

    if (dryRun) {
      console.log(
        `[dry-run] ${trip.driver.fullName} ${(Number(trip.grossAmountCents) / 100).toFixed(2)}€ ${before} → ${after}`,
      );
    } else {
      await withTenant(tenant.id, (tx) =>
        tx.trip.update({ where: { id: trip.id }, data: { startedAt, endedAt } }),
      );
    }
    fixed += 1;
  }

  console.log(
    `${dryRun ? "Would fix" : "Fixed"} ${fixed} trip(s), skipped ${skipped} (${trips.length} total uber poll_fallback BADAVI)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
