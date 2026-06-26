/**
 * Live Uber end-to-end probe: orgs, trip activity, payments order amounts.
 * Usage: npm run test:uber-economics -w @fleethub/worker -- [days]
 */
import path from "node:path";
import { config } from "dotenv";
import {
  listUberOrganizations,
  listAllUberDrivers,
  resolveUberOrgId,
  uberDriverDisplayName,
  uberDriverExternalId,
} from "../lib/uber-fleet-client.js";
import {
  fetchUberTripActivityRows,
  fetchUberPaymentsOrderRows,
} from "../lib/uber-reports.js";
import { filterTripActivityRows } from "../lib/uber-trip-activity-mapper.js";
import {
  countTripsWithAmounts,
  filterPaymentsDriverRows,
} from "../lib/uber-payments-driver-mapper.js";
import { mergeUberDriverTripUpserts } from "../lib/uber-driver-mappers.js";
import { paymentsDriverReportIsTripLevel } from "../lib/uber-csv-columns.js";

config({ path: path.resolve(process.cwd(), "../../.env") });
config({ path: path.resolve(process.cwd(), ".env"), override: true });

const days = Math.min(7, Math.max(1, Number.parseInt(process.argv[2] ?? "7", 10) || 7));
const to = new Date();
const from = new Date(to.getTime() - days * 86400000);

const CLIENT_FLEETS = [
  "BADAVI",
  "GALERA",
  "SANTACOLOMA",
  "TAXI BUSINESS",
  "TAXIS BUSINESS",
  "TRADETAXI",
  "TRADE TAXI",
  "DANIEL PIÑOL",
  "PIÑOL",
];

function matchesClientFleet(name: string | undefined): boolean {
  const n = (name ?? "").toUpperCase();
  return CLIENT_FLEETS.some((f) => n.includes(f.replace("Ñ", "N").normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
}

async function main() {
  const org = await resolveUberOrgId();
  if (!org.ok) {
    console.error("Org:", org.message);
    process.exit(1);
  }

  console.log("=== Uber live test ===");
  console.log("Window:", from.toISOString().slice(0, 10), "→", to.toISOString().slice(0, 10), `(${days}d)`);
  console.log("UBER_ORG_ID:", org.data.slice(0, 32) + "…");

  const orgs = await listUberOrganizations();
  console.log("\n--- Organizations ---");
  if (orgs.ok) {
    for (const o of orgs.data) {
      const match = matchesClientFleet(o.name) ? "✓ client fleet" : "extra/other";
      console.log(`• ${o.name ?? "(unnamed)"} [${match}]`);
    }
  } else {
    console.log("Failed:", orgs.message);
  }

  console.log("\n--- Reports (org-level) ---");
  const [activity, orders] = await Promise.all([
    fetchUberTripActivityRows(org.data, from, to),
    fetchUberPaymentsOrderRows(org.data, from, to),
  ]);

  console.log(
    "Trip Activity:",
    activity.ok ? `${activity.data.length} rows` : activity.message,
  );
  console.log(
    "Payments Order:",
    orders.ok ? `${orders.data.length} rows, trip-level=${orders.ok && paymentsDriverReportIsTripLevel(orders.data)}` : orders.message,
  );

  if (!activity.ok || !orders.ok) {
    process.exit(1);
  }

  const drivers = await listAllUberDrivers(org.data);
  if (!drivers.ok) {
    console.error("Drivers:", drivers.message);
    process.exit(1);
  }
  console.log("Drivers in org:", drivers.data.length);

  console.log("\n--- Per-driver merge (activity + payments order) ---");
  let best: {
    name: string;
    id: string;
    trips: number;
    withAmounts: number;
    sampleGross: string;
  } | null = null;

  for (const d of drivers.data) {
    const id = uberDriverExternalId(d);
    if (!id) continue;
    const args = { driverId: id, from, to };
    const activityTrips = filterTripActivityRows(activity.data, args);
    if (activityTrips.length === 0) continue;
    const paymentTrips = filterPaymentsDriverRows(orders.data, args);
    const merged = mergeUberDriverTripUpserts(activityTrips, paymentTrips);
    const withAmounts = countTripsWithAmounts(merged);
    const sample = merged.find((t) => t.grossAmountCents && t.grossAmountCents > 0n);
    const row = {
      name: uberDriverDisplayName(d),
      id,
      trips: merged.length,
      withAmounts,
      sampleGross: sample
        ? `${Number(sample.grossAmountCents) / 100}€ (fee ${sample.platformFeeCents != null ? Number(sample.platformFeeCents) / 100 : "?"}€)`
        : "—",
    };
    if (!best || withAmounts > best.withAmounts || (withAmounts === best.withAmounts && row.trips > best.trips)) {
      best = row;
    }
    if (withAmounts > 0 && activityTrips.length >= 5) {
      console.log(
        ` ${id.slice(0, 8)}… ${row.name.slice(0, 24)} | trips ${row.trips} | with € ${withAmounts} | sample ${row.sampleGross}`,
      );
    }
  }

  const totalActivity = activity.data.length;
  const totalOrders = orders.data.length;
  let allMerged = 0;
  let allWithAmounts = 0;
  for (const d of drivers.data) {
    const id = uberDriverExternalId(d);
    if (!id) continue;
    const args = { driverId: id, from, to };
    const merged = mergeUberDriverTripUpserts(
      filterTripActivityRows(activity.data, args),
      filterPaymentsDriverRows(orders.data, args),
    );
    allMerged += merged.length;
    allWithAmounts += countTripsWithAmounts(merged);
  }

  console.log("\n--- Summary ---");
  console.log(`Org trips (activity rows): ${totalActivity}`);
  console.log(`Org payment rows (order): ${totalOrders}`);
  console.log(`Matched driver trips: ${allMerged}`);
  console.log(`Trips with economic data: ${allWithAmounts} (${allMerged > 0 ? Math.round((100 * allWithAmounts) / allMerged) : 0}%)`);
  if (best) {
    console.log(`Best driver: ${best.name} — ${best.withAmounts}/${best.trips} with amounts, sample ${best.sampleGross}`);
  }

  if (allWithAmounts === 0) {
    console.log("\nFAIL: no trip amounts after payments order merge");
    process.exit(1);
  }
  console.log("\nOK: Uber economic data available via Payments Order report");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
