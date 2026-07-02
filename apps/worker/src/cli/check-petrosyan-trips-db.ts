/**
 * Quick DB check for Petrosyan trip 12.60 on 2026-07-02.
 */
import "../load-env.js";
import { RidePlatform, withTenant, withoutTenant } from "@fleethub/db";
import { tenantCalendarDayKey } from "@fleethub/auth/display-timezone";

async function main() {
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug: "cosculluela" }, select: { id: true } }),
  );
  if (!tenant) throw new Error("no tenant");

  const driver = await withTenant(tenant.id, (tx) =>
    tx.driver.findFirst({
      where: { tenantId: tenant.id, fullName: { contains: "Petrosyan", mode: "insensitive" } },
      select: { id: true, fullName: true },
    }),
  );
  if (!driver) throw new Error("no driver");

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
        id: true,
        externalTripId: true,
        startedAt: true,
        grossAmountCents: true,
        netAmountCents: true,
        liquidationStatus: true,
        fareType: true,
        paymentMethod: true,
        createdAt: true,
        updatedAt: true,
        ingestSource: true,
      },
    }),
  );

  console.log("Driver:", driver.fullName);
  for (const t of trips) {
    const gross = Number(t.grossAmountCents) / 100;
    const madrid = t.startedAt.toLocaleString("es-ES", { timeZone: "Europe/Madrid" });
    const dayKey = tenantCalendarDayKey(t.startedAt);
    console.log({
      externalTripId: t.externalTripId.slice(0, 8) + "…",
      startedAtUtc: t.startedAt.toISOString(),
      madrid,
      dayKey,
      gross,
      liquidationStatus: t.liquidationStatus,
      createdAt: t.createdAt.toISOString(),
      fareType: t.fareType,
    });
  }

  const pending = await withTenant(tenant.id, (tx) =>
    tx.trip.count({
      where: { tenantId: tenant.id, driverId: driver.id, liquidationStatus: "pending" },
    }),
  );
  console.log("\nPending trips total:", pending);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
