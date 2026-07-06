import "../load-env.js";
import { RidePlatform, withTenant } from "@fleethub/db";
import { uberSyncOrgIdFromMetadata } from "../lib/uber-tenant-group-orgs.js";

const TENANT_ID = "442462fa-ee23-4009-bb5f-919032762333";

async function main() {
  const from = new Date(Date.now() - 30 * 86400000);
  for (const needle of ["ERIC SALAS", "FIDEL DAVALOS"]) {
    const d = await withTenant(TENANT_ID, (tx) =>
      tx.driver.findFirst({
        where: { tenantId: TENANT_ID, fullName: { contains: needle, mode: "insensitive" } },
        select: {
          id: true,
          fullName: true,
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
    console.log("\n===", needle, "===");
    console.log(JSON.stringify(d, null, 2));
    if (!d) continue;
    const uberTrips = await withTenant(TENANT_ID, (tx) =>
      tx.trip.count({
        where: {
          tenantId: TENANT_ID,
          driverId: d.id,
          platform: RidePlatform.UBER,
          startedAt: { gte: from },
        },
      }),
    );
    const fnTrips = await withTenant(TENANT_ID, (tx) =>
      tx.trip.count({
        where: {
          tenantId: TENANT_ID,
          driverId: d.id,
          platform: RidePlatform.FREENOW,
          startedAt: { gte: from },
        },
      }),
    );
    const uber = d.driverPlatformAccounts.find((a) => a.platform === RidePlatform.UBER);
    console.log("trips 30d uber/fn:", uberTrips, fnTrips);
    console.log("uberSyncOrgId:", uber ? uberSyncOrgIdFromMetadata(uber.metadata) : null);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
