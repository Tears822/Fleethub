/** Live test: multi-org Uber link + sync for Santacoloma (Cesar). */
import "../load-env.js";
import { RidePlatform, withoutTenant, withTenant } from "@fleethub/db";
import { upsertNormalizedTripsForDriver } from "@fleethub/auth";
import { linkUberDriversForTenant } from "../lib/uber-link-drivers.js";
import { syncUberTripsViaReports } from "../lib/uber-reports.js";
import { uberSyncOrgIdFromMetadata } from "../lib/uber-tenant-group-orgs.js";

const TENANT_ID = "442462fa-ee23-4009-bb5f-919032762333";
const CESAR_UUID = "6bfd6d4e-9e43-4645-817f-0640e7d2b425";

async function main() {
  console.log("=== Multi-org Uber link test ===");
  const linked = await linkUberDriversForTenant(TENANT_ID);
  console.log("linked:", linked);

  const dpa = await withTenant(TENANT_ID, (tx) =>
    tx.driverPlatformAccount.findFirst({
      where: {
        tenantId: TENANT_ID,
        platform: RidePlatform.UBER,
        externalDriverId: CESAR_UUID,
      },
      select: { id: true, metadata: true, driver: { select: { fullName: true } } },
    }),
  );

  if (!dpa) {
    console.error("Cesar Uber DPA not found");
    process.exit(1);
  }

  console.log("Cesar org metadata:", uberSyncOrgIdFromMetadata(dpa.metadata));

  const from = new Date(Date.now() - 7 * 86400000);
  const to = new Date();
  const res = await syncUberTripsViaReports({
    tenantId: TENANT_ID,
    driverId: CESAR_UUID,
    driverPlatformAccountId: dpa.id,
    from,
    to,
  });

  if (!res.ok) {
    console.error("sync fail:", res.message);
    process.exit(1);
  }

  console.log("trips fetched:", res.data.length);

  const driverId = (
    await withTenant(TENANT_ID, (tx) =>
      tx.driverPlatformAccount.findUnique({ where: { id: dpa.id }, select: { driverId: true } }),
    )
  )!.driverId;

  if (res.data.length > 0) {
    const ingest = await upsertNormalizedTripsForDriver(
      TENANT_ID,
      dpa.id,
      driverId,
      RidePlatform.UBER,
      res.data,
      "manual_backfill",
    );
    console.log("upserted:", ingest);
  }

  const count = await withTenant(TENANT_ID, (tx) =>
    tx.trip.count({
      where: {
        tenantId: TENANT_ID,
        driverId,
        platform: RidePlatform.UBER,
        startedAt: { gte: from },
      },
    }),
  );
  console.log("Cesar Uber trips in DB (30d):", count);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
