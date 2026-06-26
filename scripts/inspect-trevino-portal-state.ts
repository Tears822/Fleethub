import path from "node:path";
import { config } from "dotenv";
import { withoutTenant, RidePlatform } from "@fleethub/db";

config({ path: path.resolve(process.cwd(), ".env") });
config({ path: path.resolve(process.cwd(), "../../.env"), override: true });

async function main() {
  const slug = process.argv[2] ?? "trevino";
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug }, select: { id: true, slug: true } }),
  );
  if (!tenant) throw new Error("tenant not found");

  const pendingByPlatform = await withoutTenant(
    (tx) =>
      tx.trip.groupBy({
        by: ["platform"],
        where: { tenantId: tenant.id, liquidationStatus: "pending" },
        _count: true,
      }),
    undefined,
    tenant.id,
  );
  console.log("\nPending trips by platform:", pendingByPlatform);

  const pendingDrivers = await withoutTenant(
    (tx) =>
      tx.trip.findMany({
        where: { tenantId: tenant.id, liquidationStatus: "pending" },
        select: {
          platform: true,
          driver: { select: { fullName: true, isActive: true } },
        },
        distinct: ["driverId", "platform"],
      }),
    undefined,
    tenant.id,
  );
  const byDriver = new Map<string, Set<string>>();
  for (const t of pendingDrivers) {
    const set = byDriver.get(t.driver.fullName) ?? new Set();
    set.add(t.platform);
    byDriver.set(t.driver.fullName, set);
  }
  console.log("\nPending drivers:");
  for (const [name, platforms] of [...byDriver.entries()].sort()) {
    console.log(`  ${name}: ${[...platforms].join(", ")}`);
  }

  for (const needle of ["RACHID", "SAMER"]) {
    const drivers = await withoutTenant(
      (tx) =>
        tx.driver.findMany({
          where: {
            tenantId: tenant.id,
            fullName: { contains: needle, mode: "insensitive" },
          },
          select: {
            id: true,
            fullName: true,
            isActive: true,
            email: true,
            dni: true,
            company: { select: { legalName: true } },
            driverPlatformAccounts: {
              select: { platform: true, isActive: true, externalDriverId: true },
            },
          },
        }),
      undefined,
      tenant.id,
    );
    console.log(`\n${needle} drivers:`, JSON.stringify(drivers, null, 2));
  }

  const noPlatform = await withoutTenant(
    (tx) =>
      tx.driver.findMany({
        where: {
          tenantId: tenant.id,
          isActive: true,
          driverPlatformAccounts: { none: { isActive: true } },
        },
        select: {
          fullName: true,
          company: { select: { legalName: true } },
          driverPlatformAccounts: {
            select: { platform: true, isActive: true, externalDriverId: true },
          },
        },
        orderBy: { fullName: "asc" },
      }),
    undefined,
    tenant.id,
  );
  console.log(`\nActive drivers with NO active platform (${noPlatform.length}):`);
  for (const d of noPlatform) {
    console.log(`  ${d.fullName} (${d.company.legalName}) inactive:`, d.driverPlatformAccounts);
  }

  const uberAccounts = await withoutTenant(
    (tx) =>
      tx.driverPlatformAccount.count({
        where: { tenantId: tenant.id, platform: RidePlatform.UBER, isActive: true },
      }),
    undefined,
    tenant.id,
  );
  const uberTrips = await withoutTenant(
    (tx) =>
      tx.trip.count({
        where: { tenantId: tenant.id, platform: RidePlatform.UBER },
      }),
    undefined,
    tenant.id,
  );
  const uberPending = await withoutTenant(
    (tx) =>
      tx.trip.count({
        where: {
          tenantId: tenant.id,
          platform: RidePlatform.UBER,
          liquidationStatus: "pending",
        },
      }),
    undefined,
    tenant.id,
  );
  console.log(`\nUber: ${uberAccounts} active accounts, ${uberTrips} total trips, ${uberPending} pending`);

  const syncRuns = await withoutTenant(
    (tx) =>
      tx.platformSyncRun.findMany({
        where: { tenantId: tenant.id },
        orderBy: { startedAt: "desc" },
        take: 6,
        select: {
          platform: true,
          status: true,
          startedAt: true,
          finishedAt: true,
          tripsUpserted: true,
          message: true,
        },
      }),
    undefined,
    tenant.id,
  );
  console.log("\nRecent sync runs:");
  for (const r of syncRuns) {
    console.log(
      `  ${r.platform} ${r.status} trips=${r.tripsUpserted} ${r.startedAt?.toISOString()} ${r.message ?? ""}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
