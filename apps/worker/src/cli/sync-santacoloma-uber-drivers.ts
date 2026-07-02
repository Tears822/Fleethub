/**
 * Santacoloma Uber: link + sync remaining drivers (Eric Salas, etc.).
 */
import "../load-env.js";
import { RidePlatform, withTenant } from "@fleethub/db";
import { upsertNormalizedTripsForDriver } from "@fleethub/auth";
import { linkUberDriversForTenant } from "../lib/uber-link-drivers.js";
import { syncUberTripsViaReports } from "../lib/uber-reports.js";
import { listAllUberDrivers, uberDriverDisplayName, uberDriverExternalId } from "../lib/uber-fleet-client.js";
import { resolveTenantUberOrgIds, uberSyncOrgIdFromMetadata } from "../lib/uber-tenant-group-orgs.js";

const TENANT_ID = "442462fa-ee23-4009-bb5f-919032762333";
const DAYS = 30;

async function main() {
  console.log("=== Santacoloma Uber — link + sync ===\n");

  const orgs = await resolveTenantUberOrgIds(TENANT_ID);
  if (!orgs.ok) throw new Error(orgs.message);

  const santaOrg = orgs.data.find((o) => o.orgName.toLowerCase().includes("santacoloma"));
  console.log("Santacoloma org:", santaOrg?.orgName ?? "NOT FOUND");

  if (santaOrg) {
    const api = await listAllUberDrivers(santaOrg.orgId);
    if (api.ok) {
      console.log("Uber API drivers in Santacoloma org:", api.data.length);
      for (const row of api.data) {
        console.log(" ", uberDriverExternalId(row), uberDriverDisplayName(row));
      }
    }
  }

  const linked = await linkUberDriversForTenant(TENANT_ID);
  console.log("\nLink result:", linked);

  const drivers = await withTenant(TENANT_ID, (tx) =>
    tx.driver.findMany({
      where: {
        tenantId: TENANT_ID,
        isActive: true,
        company: { legalName: { contains: "SANTACOLOMA", mode: "insensitive" } },
      },
      select: {
        id: true,
        fullName: true,
        driverPlatformAccounts: {
          where: { isActive: true },
          select: { id: true, platform: true, externalDriverId: true, metadata: true },
        },
      },
      orderBy: { fullName: "asc" },
    }),
  );

  const from = new Date(Date.now() - DAYS * 86400000);
  const to = new Date();

  for (const d of drivers) {
    console.log(`\n--- ${d.fullName} ---`);
    for (const acc of d.driverPlatformAccounts) {
      console.log(
        " ",
        acc.platform,
        acc.externalDriverId.slice(0, 20),
        acc.platform === "UBER" ? `org=${(uberSyncOrgIdFromMetadata(acc.metadata) ?? "?").slice(0, 20)}…` : "",
      );
    }

    const uber = d.driverPlatformAccounts.find((a) => a.platform === RidePlatform.UBER);
    if (!uber?.externalDriverId || uber.externalDriverId.startsWith("manual-")) {
      console.log("  skip: no Uber UUID");
      continue;
    }

    const before = await withTenant(TENANT_ID, (tx) =>
      tx.trip.count({
        where: { tenantId: TENANT_ID, driverId: d.id, platform: RidePlatform.UBER, startedAt: { gte: from } },
      }),
    );
    console.log("  trips before:", before);

    const res = await syncUberTripsViaReports({
      tenantId: TENANT_ID,
      driverId: uber.externalDriverId,
      driverPlatformAccountId: uber.id,
      from,
      to,
    });
    if (!res.ok) {
      console.log("  sync FAIL:", res.message);
      continue;
    }
    console.log("  fetched:", res.data.length);

    if (res.data.length > 0) {
      const ingest = await upsertNormalizedTripsForDriver(
        TENANT_ID,
        uber.id,
        d.id,
        RidePlatform.UBER,
        res.data,
        "manual_backfill",
      );
      console.log("  upserted:", ingest.upserted);
    }

    const after = await withTenant(TENANT_ID, (tx) =>
      tx.trip.count({
        where: { tenantId: TENANT_ID, driverId: d.id, platform: RidePlatform.UBER, startedAt: { gte: from } },
      }),
    );
    console.log("  trips after:", after);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
