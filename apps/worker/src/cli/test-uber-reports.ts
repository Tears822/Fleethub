/**
 * Smoke-test Uber Trip Activity report (generate → poll → CSV).
 * Usage: npm run test:uber-reports -w @fleethub/worker
 * Optional: npm run test:uber-reports -w @fleethub/worker -- <days-back>
 */
import path from "node:path";
import { config } from "dotenv";
import {
  listAllUberDrivers,
  resolveUberOrgId,
  uberDriverDisplayName,
  uberDriverExternalId,
} from "../lib/uber-fleet-client.js";
import { fetchUberTripActivityRows } from "../lib/uber-reports.js";
import { isUberSandboxEnabled } from "../lib/uber-sandbox.js";
import { filterTripActivityRows } from "../lib/uber-trip-activity-mapper.js";

config({ path: path.resolve(process.cwd(), "../../.env") });
config({ path: path.resolve(process.cwd(), ".env"), override: true });

const daysBack = Math.min(7, Math.max(1, Number.parseInt(process.argv[2] ?? "3", 10) || 3));
const to = new Date();
const from = new Date(to.getTime() - daysBack * 24 * 60 * 60 * 1000);

const org = await resolveUberOrgId();
if (!org.ok) {
  console.error(org.message);
  process.exit(1);
}

console.log("UBER_SANDBOX:", isUberSandboxEnabled(), "(set UBER_SANDBOX=false in fleethub/.env for production reports)");
console.log("Org:", org.data.slice(0, 20) + "…");
console.log("Range: last %d day(s) (%s → %s)", daysBack, from.toISOString(), to.toISOString());

const rows = await fetchUberTripActivityRows(org.data, from, to);
if (!rows.ok) {
  console.error("Report failed:", rows.message);
  process.exit(1);
}

console.log("CSV rows:", rows.data.length);

const drivers = await listAllUberDrivers(org.data);
if (drivers.ok && drivers.data[0]) {
  const driverId = uberDriverExternalId(drivers.data[0])!;
  const trips = filterTripActivityRows(rows.data, { driverId, from, to });
  console.log(
    "Trips for %s (%s): %d",
    uberDriverDisplayName(drivers.data[0]),
    driverId.slice(0, 8) + "…",
    trips.length,
  );
  for (const t of trips.slice(0, 5)) {
    console.log(" -", t.externalTripId.slice(0, 12) + "…", t.startedAt, t.grossAmountCents?.toString() ?? "—");
  }
}

console.log("\nUber reports OK.");
