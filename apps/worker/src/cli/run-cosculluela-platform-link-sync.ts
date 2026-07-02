/**
 * Follow-up: link all platforms + sync Santacoloma/Galera gap drivers (cosculluela).
 * Usage: npx tsx src/cli/run-with-worker-uber-env.ts src/cli/run-cosculluela-platform-link-sync.ts
 */
import "../load-env.js";
import { RidePlatform, withTenant } from "@fleethub/db";
import { upsertNormalizedTripsForDriver } from "@fleethub/auth";
import {
  syncFreenowDriversForAllLinkedCompanies,
  syncUberDriversForTenant,
} from "../lib/platform-driver-sync.js";
import { syncUberTripsViaReports } from "../lib/uber-reports.js";
import { uberSyncOrgIdFromMetadata } from "../lib/uber-tenant-group-orgs.js";
import { isFreenowPublicDriverId } from "../lib/freenow-link-drivers.js";

const TENANT_ID = "442462fa-ee23-4009-bb5f-919032762333";
const DAYS = 7;

async function main() {
  console.log("=== 1. Uber multi-org link ===");
  const uberLink = await syncUberDriversForTenant(TENANT_ID);
  console.log(uberLink);

  console.log("\n=== 2. FreeNow link (all umbrella companies + weak IDs) ===");
  const fnLink = await syncFreenowDriversForAllLinkedCompanies(TENANT_ID);
  console.log(fnLink);

  const weakBefore = await countWeakFreenowIds();
  console.log("FreeNow weak IDs remaining:", weakBefore);

  console.log("\n=== 3. Uber trip sync — gap companies (Santacoloma, Galera 0-trip) ===");
  const from = new Date(Date.now() - DAYS * 86400000);
  const to = new Date();

  const targets = await withTenant(TENANT_ID, (tx) =>
    tx.driver.findMany({
      where: {
        tenantId: TENANT_ID,
        isActive: true,
        OR: [
          { company: { legalName: { contains: "SANTACOLOMA", mode: "insensitive" } } },
          { company: { legalName: { contains: "GALERA", mode: "insensitive" } } },
        ],
        driverPlatformAccounts: {
          some: { platform: RidePlatform.UBER, isActive: true },
        },
      },
      select: {
        id: true,
        fullName: true,
        company: { select: { legalName: true } },
        driverPlatformAccounts: {
          where: { platform: RidePlatform.UBER, isActive: true },
          select: { id: true, externalDriverId: true, metadata: true },
        },
      },
    }),
  );

  let synced = 0;
  let tripTotal = 0;

  for (const d of targets) {
    const dpa = d.driverPlatformAccounts[0];
    if (!dpa?.externalDriverId || dpa.externalDriverId.startsWith("manual-")) continue;

    const existing = await withTenant(TENANT_ID, (tx) =>
      tx.trip.count({
        where: { tenantId: TENANT_ID, driverId: d.id, platform: RidePlatform.UBER, startedAt: { gte: from } },
      }),
    );
    if (existing > 0) continue;

    console.log(`\n  sync ${d.fullName} (${d.company.legalName}) org=${uberSyncOrgIdFromMetadata(dpa.metadata)?.slice(0, 16) ?? "?"}…`);
    const res = await syncUberTripsViaReports({
      tenantId: TENANT_ID,
      driverId: dpa.externalDriverId,
      driverPlatformAccountId: dpa.id,
      from,
      to,
    });
    if (!res.ok) {
      console.warn("  FAIL:", res.message);
      continue;
    }
    if (res.data.length === 0) {
      console.log("  0 trips in window");
      continue;
    }
    const ingest = await upsertNormalizedTripsForDriver(
      TENANT_ID,
      dpa.id,
      d.id,
      RidePlatform.UBER,
      res.data,
      "manual_backfill",
    );
    synced += 1;
    tripTotal += ingest.upserted;
    console.log(`  → ${ingest.upserted} trip(s)`);
  }

  console.log("\n=== Summary ===");
  console.log("Uber linked:", uberLink.linked);
  console.log("FreeNow linked:", fnLink.linked);
  console.log("FreeNow weak IDs after:", await countWeakFreenowIds());
  console.log("Gap drivers synced:", synced, "trips upserted:", tripTotal);

  await printCompanyAudit(from);
}

async function countWeakFreenowIds(): Promise<number> {
  const dpas = await withTenant(TENANT_ID, (tx) =>
    tx.driverPlatformAccount.findMany({
      where: { tenantId: TENANT_ID, platform: RidePlatform.FREENOW, isActive: true },
      select: { externalDriverId: true },
    }),
  );
  return dpas.filter((d) => !isFreenowPublicDriverId(d.externalDriverId.trim())).length;
}

async function printCompanyAudit(since: Date) {
  const companies = ["SANTACOLOMA TAXI, S.L.", "TAXIS BLANCO, SL", "TAXIS GALERA, S.L."];
  for (const name of companies) {
    const co = await withTenant(TENANT_ID, (tx) =>
      tx.company.findFirst({
        where: { tenantId: TENANT_ID, legalName: { equals: name, mode: "insensitive" } },
        select: { id: true },
      }),
    );
    if (!co) continue;
    const drivers = await withTenant(TENANT_ID, (tx) =>
      tx.driver.count({ where: { tenantId: TENANT_ID, companyId: co.id, isActive: true } }),
    );
    const withTrips = await withTenant(TENANT_ID, (tx) =>
      tx.driver.count({
        where: {
          tenantId: TENANT_ID,
          companyId: co.id,
          isActive: true,
          trips: { some: { startedAt: { gte: since } } },
        },
      }),
    );
    console.log(`  ${name}: ${withTrips}/${drivers} drivers with trips (${DAYS}d)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
