/**
 * Targeted Uber backfill — Kelvin OMONDIALE TONY 16/06/2026 (cosculluela + trevino).
 * Usage: npm run backfill:kelvin-uber -w @fleethub/worker
 */
import path from "node:path";
import { config } from "dotenv";
import { upsertNormalizedTripsForDriver } from "@fleethub/auth";
import { lookupTenantIdBySlug, RidePlatform, withTenant } from "@fleethub/db";
import { resolveUberOrgId } from "../lib/uber-fleet-client.js";
import {
  fetchUberPaymentsOrderRows,
  fetchUberTripActivityRows,
} from "../lib/uber-reports.js";
import { filterTripActivityRows } from "../lib/uber-trip-activity-mapper.js";
import {
  filterPaymentsDriverRows,
  tripUpsertHasAmounts,
} from "../lib/uber-payments-driver-mapper.js";
import { mergeUberDriverTripUpserts } from "../lib/uber-driver-mappers.js";
import { pickColumn } from "../lib/uber-csv-columns.js";

config({ path: path.resolve(process.cwd(), "../../.env") });
config({ path: path.resolve(process.cwd(), ".env"), override: true });

const KELVIN_UUID = "c4b25553-43f1-40e7-8e41-5d3c69df62bc";
const FROM = new Date("2026-06-16T00:00:00+02:00");
const TO = new Date("2026-06-17T00:00:00+02:00");
const TENANTS = ["cosculluela", "trevino", "trade-taxi-sl"] as const;

async function backfillTenant(slug: string) {
  const tenantId = await lookupTenantIdBySlug(slug);
  if (!tenantId) {
    console.warn(`Tenant not found: ${slug}`);
    return;
  }

  const dpa = await withTenant(tenantId, (tx) =>
    tx.driverPlatformAccount.findFirst({
      where: {
        tenantId,
        platform: RidePlatform.UBER,
        externalDriverId: KELVIN_UUID,
        isActive: true,
      },
      select: { id: true, driverId: true, externalDriverId: true },
    }),
  );
  if (!dpa) {
    console.warn(`[${slug}] Kelvin Uber account not found`);
    return;
  }

  const org = await resolveUberOrgId();
  if (!org.ok) throw new Error(org.message);

  const [activity, orders] = await Promise.all([
    fetchUberTripActivityRows(org.data, FROM, TO),
    fetchUberPaymentsOrderRows(org.data, FROM, TO),
  ]);
  if (!activity.ok) throw new Error(`activity: ${activity.message}`);
  if (!orders.ok) throw new Error(`payments order: ${orders.message}`);

  const kelvinOrders = orders.data.filter(
    (row) =>
      pickColumn(row, ["Driver UUID", "UUID del conductor", "UUID de conductor"]).toLowerCase() ===
      KELVIN_UUID.toLowerCase(),
  );

  const actTrips = filterTripActivityRows(activity.data, {
    driverId: KELVIN_UUID,
    from: FROM,
    to: TO,
  });
  const payTrips = filterPaymentsDriverRows(kelvinOrders, {
    driverId: KELVIN_UUID,
    from: FROM,
    to: TO,
  });
  const merged = mergeUberDriverTripUpserts(actTrips, payTrips);

  console.log(`[${slug}] merged ${merged.length} trips, with amounts: ${merged.filter(tripUpsertHasAmounts).length}`);
  for (const t of merged) {
    const g = Number(t.grossAmountCents ?? 0) / 100;
    const tip = Number(t.tipCents ?? 0) / 100;
    if (g > 30 || tip > 0) {
      console.log(`  ${t.externalTripId.slice(0, 8)}… ${g.toFixed(2)} € tip ${tip.toFixed(2)} € ${t.fareType}`);
    }
  }

  const result = await upsertNormalizedTripsForDriver(
    tenantId,
    dpa.id,
    dpa.driverId,
    RidePlatform.UBER,
    merged,
    "reconcile",
  );
  console.log(`[${slug}] upserted ${result.upserted} updated ${result.updated}`);
}

async function main() {
  console.log("=== Kelvin Uber backfill 16/06/2026 ===");
  for (const slug of TENANTS) {
    await backfillTenant(slug);
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
