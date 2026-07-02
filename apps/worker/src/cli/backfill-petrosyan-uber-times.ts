/**
 * Re-sync Petrosyan Uber trips with fixed Madrid timezone parser.
 */
import "../load-env.js";
import { RidePlatform, withTenant, withoutTenant } from "@fleethub/db";
import { upsertNormalizedTripsForDriver } from "@fleethub/auth";
import { syncUberTripsViaReports } from "../lib/uber-reports.js";

async function main() {
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug: "cosculluela" }, select: { id: true } }),
  );
  if (!tenant) throw new Error("no tenant");

  const driver = await withTenant(tenant.id, (tx) =>
    tx.driver.findFirst({
      where: { fullName: { contains: "Petrosyan", mode: "insensitive" } },
      select: {
        id: true,
        fullName: true,
        driverPlatformAccounts: {
          where: { platform: RidePlatform.UBER, isActive: true },
          select: { id: true, externalDriverId: true },
        },
      },
    }),
  );
  if (!driver) throw new Error("no driver");
  const uber = driver.driverPlatformAccounts[0];
  if (!uber) throw new Error("no uber");

  const from = new Date("2026-06-29T22:00:00.000Z");
  const to = new Date("2026-07-03T21:59:59.999Z");

  console.log("Re-sync", driver.fullName, uber.externalDriverId.slice(0, 8) + "…");
  const res = await syncUberTripsViaReports({
    tenantId: tenant.id,
    driverId: uber.externalDriverId,
    driverPlatformAccountId: uber.id,
    from,
    to,
  });
  if (!res.ok) throw new Error(res.message);
  console.log("Fetched:", res.data.length);

  const ingest = await upsertNormalizedTripsForDriver(
    tenant.id,
    uber.id,
    driver.id,
    RidePlatform.UBER,
    res.data,
    "manual_backfill",
  );
  console.log("Upserted:", ingest.upserted);

  const trips = await withTenant(tenant.id, (tx) =>
    tx.trip.findMany({
      where: {
        tenantId: tenant.id,
        driverId: driver.id,
        platform: RidePlatform.UBER,
        startedAt: { gte: new Date("2026-07-01T22:00:00Z"), lte: new Date("2026-07-02T21:59:59Z") },
      },
      orderBy: { startedAt: "asc" },
      select: {
        externalTripId: true,
        startedAt: true,
        grossAmountCents: true,
        liquidationStatus: true,
      },
    }),
  );

  console.log("\n02/07 trips after backfill:");
  for (const t of trips) {
    const madrid = t.startedAt.toLocaleString("es-ES", { timeZone: "Europe/Madrid" });
    console.log(
      `  ${madrid} | ${Number(t.grossAmountCents) / 100}€ | ${t.liquidationStatus} | ${t.externalTripId.slice(0, 8)}…`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
