/**
 * Probe Eric Salas Uber UUID across all orgs + DB state.
 */
import "../load-env.js";
import { RidePlatform, withTenant } from "@fleethub/db";
import {
  listAllUberDrivers,
  listUberOrganizations,
  uberDriverDisplayName,
  uberDriverExternalId,
} from "../lib/uber-fleet-client.js";
import { syncUberTripsViaReports } from "../lib/uber-reports.js";

const TENANT_ID = "442462fa-ee23-4009-bb5f-919032762333";
const ERIC_UUID = "94f5ff07-d0bc-4bd6-9b52-4cf18df55b00";

async function main() {
  const driver = await withTenant(TENANT_ID, (tx) =>
    tx.driver.findFirst({
      where: { tenantId: TENANT_ID, fullName: { contains: "ERIC SALAS", mode: "insensitive" } },
      select: {
        id: true,
        fullName: true,
        email: true,
        driverPlatformAccounts: { select: { id: true, platform: true, externalDriverId: true, isActive: true } },
      },
    }),
  );
  console.log("DB driver:", driver);

  const orgs = await listUberOrganizations();
  if (!orgs.ok) throw new Error(orgs.message);

  console.log("\nScanning", orgs.data.length, "orgs for Eric UUID or name…");
  let foundInRoster = false;
  for (const org of orgs.data) {
    const listed = await listAllUberDrivers(org.id);
    if (!listed.ok) continue;
    for (const d of listed.data) {
      const uuid = uberDriverExternalId(d);
      const name = uberDriverDisplayName(d);
      if (
        uuid?.toLowerCase() === ERIC_UUID.toLowerCase() ||
        name.toLowerCase().includes("eric") && name.toLowerCase().includes("salas")
      ) {
        console.log(" ROSTER HIT:", org.name, uuid, name);
        foundInRoster = true;
      }
    }
  }
  if (!foundInRoster) console.log(" Eric not in any org driver roster");

  const from = new Date(Date.now() - 30 * 86400000);
  const to = new Date();
  console.log("\nTrip report probe for UUID", ERIC_UUID.slice(0, 8) + "…");
  const res = await syncUberTripsViaReports({
    tenantId: TENANT_ID,
    driverId: ERIC_UUID,
    from,
    to,
  });
  if (!res.ok) {
    console.log(" sync FAIL:", res.message);
  } else {
    console.log(" trips found:", res.data.length);
    if (res.data.length > 0) {
      console.log(" sample:", res.data.slice(0, 2).map((t) => ({ id: t.externalTripId, at: t.startedAt, amt: t.grossAmountCents })));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
