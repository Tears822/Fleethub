/**
 * Probe Uber API/reports for Kelvin 16/06/2026 — missing 40,80€ + 48,15€ fares.
 * Usage: npm run probe:kelvin-uber -w @fleethub/worker
 */
import path from "node:path";
import { config } from "dotenv";
import { resolveUberOrgId, fetchUberDriverPayments } from "../lib/uber-fleet-client.js";
import {
  fetchUberTripActivityRows,
  fetchUberPaymentsOrderRows,
  fetchUberPaymentsDriverRows,
} from "../lib/uber-reports.js";
import { filterTripActivityRows } from "../lib/uber-trip-activity-mapper.js";
import {
  filterPaymentsDriverRows,
  paymentsDriverRowToUpsert,
  tripUpsertHasAmounts,
} from "../lib/uber-payments-driver-mapper.js";
import { pickColumn } from "../lib/uber-csv-columns.js";
import { mergeUberDriverTripUpserts } from "../lib/uber-driver-mappers.js";

config({ path: path.resolve(process.cwd(), "../../.env") });
config({ path: path.resolve(process.cwd(), ".env"), override: true });

const KELVIN_UUID = "c4b25553-43f1-40e7-8e41-5d3c69df62bc";
const STUB_TRIP_IDS = [
  "bd6ea1df-a893-44a2-a674-e79c8d270e05",
  "b30d66f8-a7ee-4c0c-9ec7-e1cac6e70a50",
];
const TARGET_GROSS = [40.8, 48.15, 40.8, 48.15];

const from = new Date("2026-06-16T00:00:00+02:00");
const to = new Date("2026-06-17T00:00:00+02:00");

function fmtEuro(cents: bigint | null | undefined): string {
  if (cents == null) return "—";
  return (Number(cents) / 100).toFixed(2) + " €";
}

function tripIdFromRow(row: Record<string, string>): string {
  return pickColumn(row, [
    "Trip UUID",
    "trip_uuid",
    "UUID del viaje",
    "UUID de viaje",
    "Trip ID",
  ]);
}

async function main() {
  const org = await resolveUberOrgId();
  if (!org.ok) {
    console.error("Org:", org.message);
    process.exit(1);
  }

  console.log("=== Kelvin Uber probe 16/06/2026 ===");
  console.log("Driver UUID:", KELVIN_UUID);
  console.log("Window:", from.toISOString(), "→", to.toISOString());

  // 1) Real-time Vehicle Suppliers payments API (usually last ~24h only)
  const payApi = await fetchUberDriverPayments({
    orgId: org.data,
    startTimeMs: from.getTime(),
    endTimeMs: to.getTime(),
    driverId: KELVIN_UUID,
  });
  if (!payApi.ok) {
    console.log("\n[API earners/payments] ERROR:", payApi.message);
  } else {
    const withTrip = payApi.data.filter((p) => p.trip_id?.trim());
    console.log("\n[API earners/payments] rows:", payApi.data.length, "with trip_id:", withTrip.length);
    for (const p of withTrip.slice(0, 20)) {
      console.log(
        "  trip",
        p.trip_id?.slice(0, 8),
        p.category,
        p.amount,
        p.event_time ? new Date(p.event_time * 1000).toISOString() : "",
      );
    }
    if (payApi.data.length > 0 && withTrip.length === 0) {
      console.log("  ⚠ API payments have NO trip_id (aggregated breakdown only)");
      for (const p of payApi.data.slice(0, 5)) {
        console.log("  sample:", p.category, p.amount, p.driver_id?.slice(0, 8));
      }
    }
  }

  // 2) Trip Activity report
  const activity = await fetchUberTripActivityRows(org.data, from, to);
  if (!activity.ok) {
    console.log("\n[Trip Activity report] ERROR:", activity.message);
  } else {
    const kelvinRows = activity.data.filter((row) => {
      const d = pickColumn(row, [
        "Driver UUID",
        "driver_uuid",
        "UUID del conductor",
        "UUID de conductor",
        "Earner UUID",
      ]).toLowerCase();
      return d === KELVIN_UUID.toLowerCase();
    });
    console.log("\n[Trip Activity report] total rows:", activity.data.length, "Kelvin:", kelvinRows.length);
    for (const row of kelvinRows) {
      const id = tripIdFromRow(row);
      const upsert = filterTripActivityRows([row], { driverId: KELVIN_UUID, from, to })[0];
      console.log(
        " ",
        id,
        upsert?.startedAt?.slice(11, 16) ?? pickColumn(row, ["Trip Request Time", "Hora de solicitud del viaje"]),
        "gross",
        upsert?.grossAmountCents?.toString() ?? "—",
        "tip",
        upsert?.tipCents?.toString() ?? "—",
      );
    }
    for (const stub of STUB_TRIP_IDS) {
      const hit = kelvinRows.filter((r) => tripIdFromRow(r).includes(stub.slice(0, 8)));
      console.log(`  stub ${stub.slice(0, 8)}… in activity:`, hit.length);
    }
  }

  // 3) Payments Order report
  const orders = await fetchUberPaymentsOrderRows(org.data, from, to);
  if (!orders.ok) {
    console.log("\n[Payments Order report] ERROR:", orders.message);
  } else {
    const kelvinOrders = orders.data.filter((row) => {
      const d = pickColumn(row, [
        "Driver UUID",
        "driver_uuid",
        "UUID del conductor",
        "UUID de conductor",
        "Earner UUID",
      ]).toLowerCase();
      return d === KELVIN_UUID.toLowerCase();
    });
    console.log("\n[Payments Order report] total rows:", orders.data.length, "Kelvin:", kelvinOrders.length);
    const paymentTrips = filterPaymentsDriverRows(kelvinOrders, {
      driverId: KELVIN_UUID,
      from,
      to,
    });
    console.log("  mapped upserts:", paymentTrips.length, "with amounts:", paymentTrips.filter(tripUpsertHasAmounts).length);
    for (const t of paymentTrips) {
      console.log(
        " ",
        t.externalTripId,
        t.startedAt.slice(11, 16),
        "gross",
        fmtEuro(t.grossAmountCents),
        "tip",
        fmtEuro(t.tipCents),
        t.fareType,
      );
    }
    for (const row of kelvinOrders) {
      const id = tripIdFromRow(row);
      if (STUB_TRIP_IDS.some((s) => id === s)) {
        const u = paymentsDriverRowToUpsert(row);
        console.log("\n  DETAIL stub row", id);
        console.log("    upsert gross:", fmtEuro(u?.grossAmountCents), "tip:", fmtEuro(u?.tipCents));
        const keys = Object.keys(row).filter((k) => /importe|precio|propina|fare|tip/i.test(k));
        for (const k of keys.slice(0, 15)) {
          const v = row[k]?.trim();
          if (v && v !== "0" && v !== "0.00") console.log(`    ${k}: ${v}`);
        }
      }
    }
  }

  // 4) Payments Driver report (often driver-level summary)
  const driverPay = await fetchUberPaymentsDriverRows(org.data, from, to);
  if (!driverPay.ok) {
    console.log("\n[Payments Driver report] ERROR:", driverPay.message);
  } else {
    const kelvinDriver = driverPay.data.filter((row) => {
      const d = pickColumn(row, [
        "Driver UUID",
        "driver_uuid",
        "UUID del conductor",
        "UUID de conductor",
        "Earner UUID",
      ]).toLowerCase();
      return d === KELVIN_UUID.toLowerCase();
    });
    console.log("\n[Payments Driver report] Kelvin rows:", kelvinDriver.length);
    if (kelvinDriver[0]) {
      const keys = Object.keys(kelvinDriver[0]).filter((k) => /importe|precio|propina/i.test(k));
      for (const k of keys) {
        const v = kelvinDriver[0][k]?.trim();
        if (v) console.log(`  ${k}: ${v}`);
      }
    }
  }

  // 5) Merged sync simulation
  if (activity.ok && orders.ok) {
    let trips = filterTripActivityRows(activity.data, { driverId: KELVIN_UUID, from, to });
    const orderTrips = filterPaymentsDriverRows(
      orders.data.filter((row) =>
        pickColumn(row, ["Driver UUID", "driver_uuid", "UUID del conductor"]).toLowerCase() ===
        KELVIN_UUID.toLowerCase(),
      ),
      { driverId: KELVIN_UUID, from, to },
    );
    const merged = mergeUberDriverTripUpserts(trips, orderTrips);
    console.log("\n[Merge activity + payments order] trips:", merged.length);
    for (const t of merged) {
      const gross = t.grossAmountCents != null ? Number(t.grossAmountCents) / 100 : 0;
      const tip = Number(t.tipCents ?? 0) / 100;
      const flag = TARGET_GROSS.some((g) => Math.abs(gross - g) < 0.02) ? "◀ TARGET?" : "";
      console.log(
        `  ${t.externalTripId.slice(0, 8)}… ${t.startedAt.slice(11, 16)} gross ${fmtEuro(t.grossAmountCents)} tip ${fmtEuro(t.tipCents)} ${t.fareType}${flag}`,
      );
    }
    const missingFares = merged.filter((t) => (t.grossAmountCents ?? 0) === BigInt(0) && (t.tipCents ?? 0) > 0);
    console.log("\n  Tip-only rows after merge:", missingFares.length);
    for (const t of missingFares) {
      console.log(`    ${t.externalTripId} tip ${fmtEuro(t.tipCents)}`);
    }
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
