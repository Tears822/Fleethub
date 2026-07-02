import "../load-env.js";
import { RidePlatform, withTenant, withoutTenant } from "@fleethub/db";

async function main() {
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug: "cosculluela" }, select: { id: true } }),
  );
  if (!tenant) return;

  const trip = await withTenant(tenant.id, (tx) =>
    tx.trip.findFirst({
      where: { externalTripId: { startsWith: "7400c26a" } },
      select: { driverId: true, driver: { select: { fullName: true } } },
    }),
  );
  console.log("18.90 driver:", trip?.driver.fullName, trip?.driverId);

  const drivers = await withTenant(tenant.id, (tx) =>
    tx.driver.findMany({
      where: { fullName: { contains: "SHAHID", mode: "insensitive" } },
      select: { id: true, fullName: true },
    }),
  );
  console.log("Shahid drivers:", drivers);

  for (const d of drivers) {
    const trips = await withTenant(tenant.id, (tx) =>
      tx.trip.findMany({
        where: {
          tenantId: tenant.id,
          driverId: d.id,
          platform: RidePlatform.UBER,
          startedAt: { gte: new Date("2026-06-26T00:00:00+02:00"), lte: new Date("2026-07-02T23:59:59+02:00") },
        },
        orderBy: { startedAt: "asc" },
        select: { startedAt: true, grossAmountCents: true },
      }),
    );
    if (trips.length === 0) continue;
    console.log(`\n${d.fullName} (${trips.length} trips):`);
    let total = 0;
    for (const t of trips) {
      const m = t.startedAt.toLocaleString("es-ES", {
        timeZone: "Europe/Madrid",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      const g = Number(t.grossAmountCents) / 100;
      total += g;
      console.log(m, g.toFixed(2));
    }
    console.log("Total:", total.toFixed(2));
  }
}

main().catch(console.error);
