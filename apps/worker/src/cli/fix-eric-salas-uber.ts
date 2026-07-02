/**
 * Reactivate Eric Salas (and similar) inactive Uber links when reports still return trips.
 * Eric drives under Guillermo Costas org, not Santacoloma roster — UUID valid via reports only.
 */
import "../load-env.js";
import { RidePlatform, withTenant } from "@fleethub/db";
import { upsertNormalizedTripsForDriver } from "@fleethub/auth";
import { listUberOrganizations } from "../lib/uber-fleet-client.js";
import {
  persistDriverUberSyncOrgId,
  UBER_SYNC_ORG_METADATA_KEY,
  UBER_SYNC_ORG_NAME_METADATA_KEY,
} from "../lib/uber-tenant-group-orgs.js";
import { syncUberTripsViaReports } from "../lib/uber-reports.js";

const TENANT_ID = "442462fa-ee23-4009-bb5f-919032762333";
const ERIC_DRIVER_ID = "c7ca5ba2-ff8b-4738-8ddc-00e04c6ded12";
const ERIC_UBER_DPA = "17c57889-656b-4103-9f97-97233ac0d065";
const ERIC_UUID = "94f5ff07-d0bc-4bd6-9b52-4cf18df55b00";
const DAYS = 30;

async function main() {
  const orgs = await listUberOrganizations();
  if (!orgs.ok) throw new Error(orgs.message);

  const guillermo = orgs.data.find((o) =>
    (o.name ?? "").toLowerCase().includes("guillermo costas"),
  );
  if (!guillermo?.id) throw new Error("Guillermo Costas org not found");
  console.log("Target org:", guillermo.name, guillermo.id);

  await withTenant(TENANT_ID, async (tx) => {
    await tx.driver.update({
      where: { id: ERIC_DRIVER_ID },
      data: { isActive: true },
    });
    await tx.driverPlatformAccount.update({
      where: { id: ERIC_UBER_DPA },
      data: {
        isActive: true,
        externalDriverId: ERIC_UUID,
        metadata: {
          source: "reactivate_reports_only_uber",
          reactivatedAt: new Date().toISOString(),
          [UBER_SYNC_ORG_METADATA_KEY]: guillermo.id,
          [UBER_SYNC_ORG_NAME_METADATA_KEY]: guillermo.name ?? "Guillermo Costas Falcón",
        },
      },
    });
  });
  console.log("Reactivated Eric Salas Uber DPA");

  const from = new Date(Date.now() - DAYS * 86400000);
  const to = new Date();

  const res = await syncUberTripsViaReports({
    tenantId: TENANT_ID,
    driverId: ERIC_UUID,
    driverPlatformAccountId: ERIC_UBER_DPA,
    from,
    to,
  });
  if (!res.ok) throw new Error(res.message);

  console.log("Fetched trips:", res.data.length);

  if (res.data.length > 0) {
    await persistDriverUberSyncOrgId(TENANT_ID, ERIC_UBER_DPA, {
      orgId: guillermo.id,
      orgName: guillermo.name ?? "Guillermo Costas Falcón",
    });
    const ingest = await upsertNormalizedTripsForDriver(
      TENANT_ID,
      ERIC_UBER_DPA,
      ERIC_DRIVER_ID,
      RidePlatform.UBER,
      res.data,
      "manual_backfill",
    );
    console.log("Upserted:", ingest.upserted);
  }

  const count = await withTenant(TENANT_ID, (tx) =>
    tx.trip.count({
      where: {
        tenantId: TENANT_ID,
        driverId: ERIC_DRIVER_ID,
        platform: RidePlatform.UBER,
        startedAt: { gte: from },
      },
    }),
  );
  console.log("Eric Uber trips (30d):", count);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
