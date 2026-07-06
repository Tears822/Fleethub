/**
 * Reactivate Fidel Davalos Uber link when reports still return trips (reports-only driver).
 */
import "../load-env.js";
import { RidePlatform, withTenant } from "@fleethub/db";
import { upsertNormalizedTripsForDriver } from "@fleethub/auth";
import {
  listAllUberDrivers,
  listUberOrganizations,
  uberDriverDisplayName,
  uberDriverExternalId,
} from "../lib/uber-fleet-client.js";
import {
  persistDriverUberSyncOrgId,
  UBER_SYNC_ORG_METADATA_KEY,
  UBER_SYNC_ORG_NAME_METADATA_KEY,
} from "../lib/uber-tenant-group-orgs.js";
import { syncUberTripsViaReports } from "../lib/uber-reports.js";

const TENANT_ID = "442462fa-ee23-4009-bb5f-919032762333";
const FIDEL_DRIVER_ID = "e0370564-b173-4ec2-85e1-74c0e4800137";
const FIDEL_UBER_DPA = "7f52851f-7f82-48ed-bc27-bddcece2b7c7";
const FIDEL_UUID = "2fa93770-8524-41ea-ab36-3149625bde05";
const FIDEL_EMAIL = "kokireyesf04@gmail.com";
const DAYS = 30;

async function resolveUuidFromRoster(): Promise<{ uuid: string; orgId: string; orgName: string } | null> {
  const orgs = await listUberOrganizations();
  if (!orgs.ok) return null;

  for (const org of orgs.data) {
    const listed = await listAllUberDrivers(org.id);
    if (!listed.ok) continue;
    for (const row of listed.data) {
      const uuid = uberDriverExternalId(row);
      const email = typeof row.email === "string" ? row.email.toLowerCase() : "";
      const name = uberDriverDisplayName(row).toLowerCase();
      if (!uuid) continue;
      if (
        email === FIDEL_EMAIL ||
        (name.includes("fidel") && name.includes("davalos"))
      ) {
        return { uuid, orgId: org.id, orgName: org.name ?? "?" };
      }
    }
  }
  return null;
}

async function main() {
  const rosterHit = await resolveUuidFromRoster();
  const uuid = rosterHit?.uuid ?? FIDEL_UUID;
  console.log("Using UUID:", uuid.slice(0, 8) + "…", rosterHit ? `(roster: ${rosterHit.orgName})` : "(spreadsheet)");

  await withTenant(TENANT_ID, async (tx) => {
    await tx.driver.update({
      where: { id: FIDEL_DRIVER_ID },
      data: { isActive: true },
    });
    await tx.driverPlatformAccount.update({
      where: { id: FIDEL_UBER_DPA },
      data: {
        isActive: true,
        externalDriverId: uuid,
        metadata: {
          source: "reactivate_reports_only_uber",
          reactivatedAt: new Date().toISOString(),
          ...(rosterHit
            ? {
                [UBER_SYNC_ORG_METADATA_KEY]: rosterHit.orgId,
                [UBER_SYNC_ORG_NAME_METADATA_KEY]: rosterHit.orgName,
              }
            : {}),
        },
      },
    });
  });
  console.log("Reactivated Fidel Davalos Uber DPA");

  const from = new Date(Date.now() - DAYS * 86400000);
  const to = new Date();

  const res = await syncUberTripsViaReports({
    tenantId: TENANT_ID,
    driverId: uuid,
    driverPlatformAccountId: FIDEL_UBER_DPA,
    from,
    to,
  });
  if (!res.ok) throw new Error(res.message);

  console.log("Fetched trips:", res.data.length);

  if (res.data.length > 0) {
    const ingest = await upsertNormalizedTripsForDriver(
      TENANT_ID,
      FIDEL_UBER_DPA,
      FIDEL_DRIVER_ID,
      RidePlatform.UBER,
      res.data,
      "manual_backfill",
    );
    console.log("Upserted:", ingest.upserted);
  } else {
    console.log("No Uber trips in window — link active for future sync");
  }

  const count = await withTenant(TENANT_ID, (tx) =>
    tx.trip.count({
      where: {
        tenantId: TENANT_ID,
        driverId: FIDEL_DRIVER_ID,
        platform: RidePlatform.UBER,
        startedAt: { gte: from },
      },
    }),
  );
  console.log("Fidel Uber trips (30d):", count);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
