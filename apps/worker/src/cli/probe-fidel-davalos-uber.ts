/**
 * Probe Fidel Davalos Uber UUID across all orgs + DB state.
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
import { uberSyncOrgIdFromMetadata } from "../lib/uber-tenant-group-orgs.js";

const TENANT_ID = "442462fa-ee23-4009-bb5f-919032762333";
const FIDEL_UUID = "2fa93770-8524-41ea-ab36-3149625bde05";

async function main() {
  const driver = await withTenant(TENANT_ID, (tx) =>
    tx.driver.findFirst({
      where: { tenantId: TENANT_ID, fullName: { contains: "FIDEL DAVALOS", mode: "insensitive" } },
      select: {
        id: true,
        fullName: true,
        email: true,
        isActive: true,
        company: { select: { legalName: true } },
        driverPlatformAccounts: {
          select: {
            id: true,
            platform: true,
            externalDriverId: true,
            isActive: true,
            metadata: true,
          },
        },
      },
    }),
  );
  console.log("DB driver:", JSON.stringify(driver, null, 2));

  const orgs = await listUberOrganizations();
  if (!orgs.ok) throw new Error(orgs.message);

  console.log("\nScanning", orgs.data.length, "orgs for Fidel UUID or name…");
  let foundInRoster = false;
  for (const org of orgs.data) {
    const listed = await listAllUberDrivers(org.id);
    if (!listed.ok) continue;
    for (const d of listed.data) {
      const uuid = uberDriverExternalId(d);
      const name = uberDriverDisplayName(d);
      if (
        uuid?.toLowerCase() === FIDEL_UUID.toLowerCase() ||
        (name.toLowerCase().includes("fidel") && name.toLowerCase().includes("davalos"))
      ) {
        console.log(" ROSTER HIT:", org.name, uuid, name);
        foundInRoster = true;
      }
    }
  }
  if (!foundInRoster) console.log(" Fidel not in any org driver roster");

  const uber = driver?.driverPlatformAccounts.find((a) => a.platform === RidePlatform.UBER);
  const from = new Date(Date.now() - 30 * 86400000);
  const to = new Date();
  console.log("\nTrip report probe for UUID", FIDEL_UUID.slice(0, 8) + "…");
  const res = await syncUberTripsViaReports({
    tenantId: TENANT_ID,
    driverId: FIDEL_UUID,
    driverPlatformAccountId: uber?.id,
    from,
    to,
  });
  if (!res.ok) {
    console.log(" sync FAIL:", res.message);
  } else {
    console.log(" trips found:", res.data.length);
    if (res.data.length > 0) {
      console.log(
        " sample:",
        res.data.slice(0, 2).map((t) => ({
          id: t.externalTripId,
          at: t.startedAt,
          amt: t.grossAmountCents,
        })),
      );
    }
  }

  if (uber) {
    console.log("\nCurrent uberSyncOrgId:", uberSyncOrgIdFromMetadata(uber.metadata));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
