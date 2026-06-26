/**
 * Compare Trip Activity rows vs drivers for each Uber org.
 * Usage: npm run inspect:uber-orgs -w @fleethub/worker -- [days]
 */
import path from "node:path";
import { config } from "dotenv";
import {
  listUberOrganizations,
  listAllUberDrivers,
  uberDriverDisplayName,
  uberDriverExternalId,
} from "../lib/uber-fleet-client.js";
import { fetchUberTripActivityRows } from "../lib/uber-reports.js";
import { filterTripActivityRows } from "../lib/uber-trip-activity-mapper.js";

config({ path: path.resolve(process.cwd(), "../../.env") });
config({ path: path.resolve(process.cwd(), ".env"), override: true });

const days = Math.min(14, Math.max(1, Number.parseInt(process.argv[2] ?? "7", 10) || 7));
const to = new Date();
const from = new Date(to.getTime() - days * 86400000);

function driverUuidFromRow(row: Record<string, string>): string {
  for (const [k, v] of Object.entries(row)) {
    const nk = k.toLowerCase();
    if (
      (nk.includes("driver") && nk.includes("uuid")) ||
      nk.includes("uuid del conductor") ||
      nk === "driver uuid"
    ) {
      const s = v?.trim();
      if (s) return s;
    }
  }
  return "";
}

async function main() {
  const orgs = await listUberOrganizations();
  if (!orgs.ok) {
    console.error(orgs.message);
    process.exit(1);
  }

  console.log("Window:", from.toISOString(), "→", to.toISOString(), `(${days}d)`);
  console.log("Organizations:", orgs.data.length);

  for (const org of orgs.data) {
    const drivers = await listAllUberDrivers(org.id);
    const rows = await fetchUberTripActivityRows(org.id, from, to);
    const rowCount = rows.ok ? rows.data.length : 0;
    console.log("\n---", org.name ?? "(unnamed)", "---");
    console.log("org_id:", org.id.slice(0, 24) + "…");
    console.log("drivers API:", drivers.ok ? drivers.data.length : drivers.message);
    console.log("trip activity rows:", rowCount, rows.ok ? "" : rows.message);

    if (drivers.ok) {
      for (const d of drivers.data) {
        const id = uberDriverExternalId(d);
        const trips =
          rows.ok && id ? filterTripActivityRows(rows.data, { driverId: id, from, to }) : [];
        console.log(
          " ",
          uberDriverDisplayName(d),
          "|",
          id?.slice(0, 8) ?? "?",
          "| matched trips:",
          trips.length,
        );
      }
    }

    if (rows.ok && rows.data.length > 0) {
      const byDriver = new Map<string, number>();
      for (const r of rows.data) {
        const id = driverUuidFromRow(r).toLowerCase();
        if (!id) continue;
        byDriver.set(id, (byDriver.get(id) ?? 0) + 1);
      }
      const top = [...byDriver.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      console.log(" top driver UUIDs in report:", top.map(([id, n]) => `${id.slice(0, 8)}…(${n})`).join(", ") || "(none parsed)");
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
