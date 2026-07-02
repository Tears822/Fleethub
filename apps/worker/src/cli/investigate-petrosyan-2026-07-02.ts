/**
 * Investigate Eduard Petrosyan missing trip + timezone on 2026-07-02.
 */
import "../load-env.js";
import { RidePlatform, withTenant, withoutTenant } from "@fleethub/db";
import { upsertNormalizedTripsForDriver } from "@fleethub/auth";
import { syncUberTripsViaReports } from "../lib/uber-reports.js";

const DAY = "2026-07-02";
const TARGET_EUROS = 12.6;

async function main() {
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug: "cosculluela" }, select: { id: true } }),
  );
  if (!tenant) throw new Error("tenant not found");

  const drivers = await withTenant(tenant.id, (tx) =>
    tx.driver.findMany({
      where: {
        tenantId: tenant.id,
        fullName: { contains: "petrosyan", mode: "insensitive" },
      },
      select: {
        id: true,
        fullName: true,
        company: { select: { legalName: true } },
        driverPlatformAccounts: {
          where: { isActive: true },
          select: { id: true, platform: true, externalDriverId: true, metadata: true },
        },
      },
    }),
  );

  console.log("Drivers found:", drivers.length);
  for (const d of drivers) {
    console.log("\n===", d.fullName, "|", d.company.legalName, "===");
    console.log("driverId:", d.id);
    for (const a of d.driverPlatformAccounts) {
      console.log(" ", a.platform, a.externalDriverId);
    }

    const dayStart = new Date(`${DAY}T00:00:00.000Z`);
    const dayEnd = new Date(`${DAY}T23:59:59.999Z`);
    const dayStartLocal = new Date(`${DAY}T00:00:00+02:00`);
    const dayEndLocal = new Date(`${DAY}T23:59:59.999+02:00`);

    const dbTrips = await withTenant(tenant.id, (tx) =>
      tx.trip.findMany({
        where: {
          tenantId: tenant.id,
          driverId: d.id,
          platform: RidePlatform.UBER,
          startedAt: { gte: dayStartLocal, lte: dayEndLocal },
        },
        orderBy: { startedAt: "asc" },
        select: {
          id: true,
          externalTripId: true,
          startedAt: true,
          endedAt: true,
          grossAmountCents: true,
          netAmountCents: true,
          paymentMethod: true,
          fareType: true,
          liquidationStatus: true,
        },
      }),
    );

    console.log("\nDB trips (UTC window):");
    for (const t of dbTrips) {
      const gross = Number(t.grossAmountCents) / 100;
      const local = new Date(t.startedAt).toLocaleString("es-ES", { timeZone: "Europe/Madrid" });
      console.log(
        `  ${t.startedAt.toISOString()} | local ${local} | ${gross.toFixed(2)}€ | ${t.fareType ?? "-"} | ${t.paymentMethod} | ${t.externalTripId.slice(0, 8)}…`,
      );
    }

    const match1260 = dbTrips.filter((t) => Math.abs(Number(t.grossAmountCents) / 100 - TARGET_EUROS) < 0.02);
    console.log(`\nTrips matching ${TARGET_EUROS}€:`, match1260.length);

    const uber = d.driverPlatformAccounts.find((a) => a.platform === RidePlatform.UBER);
    if (!uber?.externalDriverId) {
      console.log("No active Uber account");
      continue;
    }

    const from = new Date(`${DAY}T00:00:00+02:00`);
    from.setDate(from.getDate() - 1);
    const to = new Date(`${DAY}T23:59:59.999+02:00`);
    to.setDate(to.getDate() + 1);

    console.log("\nFetching Uber reports", from.toISOString(), "→", to.toISOString());
    const res = await syncUberTripsViaReports({
      tenantId: tenant.id,
      driverId: uber.externalDriverId,
      driverPlatformAccountId: uber.id,
      from,
      to,
    });

    if (!res.ok) {
      console.log("Uber sync FAIL:", res.message);
      continue;
    }

    const dayTrips = res.data.filter((t) => {
      const ms = new Date(t.startedAt).getTime();
      return ms >= dayStartLocal.getTime() && ms <= dayEndLocal.getTime();
    });

    console.log("\nUber API trips on", DAY, "(Europe/Madrid day):");
    for (const t of dayTrips.sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
      const gross = Number(t.grossAmountCents) / 100;
      const local = new Date(t.startedAt).toLocaleString("es-ES", { timeZone: "Europe/Madrid" });
      console.log(
        `  ${t.startedAt} | local ${local} | ${gross.toFixed(2)}€ | ${t.fareType ?? "-"} | ${t.externalTripId.slice(0, 8)}…`,
      );
    }

    const api1260 = res.data.filter((t) => Math.abs(Number(t.grossAmountCents) / 100 - TARGET_EUROS) < 0.02);
    console.log(`\nAPI trips matching ${TARGET_EUROS}€ (any day in window):`);
    for (const t of api1260) {
      const local = new Date(t.startedAt).toLocaleString("es-ES", { timeZone: "Europe/Madrid" });
      console.log(`  ${t.startedAt} | local ${local} | ${Number(t.grossAmountCents) / 100}€ | in DB: ${dbTrips.some((d) => d.externalTripId === t.externalTripId)}`);
    }

    const missing = dayTrips.filter((t) => !dbTrips.some((d) => d.externalTripId === t.externalTripId));
    if (missing.length > 0) {
      console.log("\nMISSING from DB:", missing.length);
      for (const t of missing) {
        console.log(" ", t.externalTripId, t.startedAt, Number(t.grossAmountCents) / 100);
      }
      console.log("\nUpserting missing trips…");
      const ingest = await upsertNormalizedTripsForDriver(
        tenant.id,
        uber.id,
        d.id,
        RidePlatform.UBER,
        missing,
        "manual_backfill",
      );
      console.log("Upserted:", ingest.upserted);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
