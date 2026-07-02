import "../load-env.js";
import { RidePlatform, withTenant, withoutTenant } from "@fleethub/db";
import { tenantCalendarDayKey } from "@fleethub/auth/display-timezone";

async function main() {
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug: "cosculluela" }, select: { id: true } }),
  );
  if (!tenant) return;

  const driver = await withTenant(tenant.id, (tx) =>
    tx.driver.findFirst({
      where: { fullName: { contains: "MOUDJITABA", mode: "insensitive" } },
      select: {
        id: true,
        fullName: true,
        driverPlatformAccounts: {
          select: { id: true, platform: true, externalDriverId: true, isActive: true, metadata: true },
        },
      },
    }),
  );
  if (!driver) return;

  console.log("Driver:", driver.fullName, driver.id);
  for (const a of driver.driverPlatformAccounts) {
    console.log(" ", a.platform, a.externalDriverId || "(empty)", a.isActive ? "active" : "inactive", a.id);
  }

  const dayStart = new Date("2026-06-26T00:00:00+02:00");
  const dayEnd = new Date("2026-06-26T23:59:59.999+02:00");

  const trips = await withTenant(tenant.id, (tx) =>
    tx.trip.findMany({
      where: {
        tenantId: tenant.id,
        driverId: driver.id,
        startedAt: { gte: dayStart, lte: dayEnd },
      },
      orderBy: { startedAt: "asc" },
      select: {
        id: true,
        platform: true,
        externalTripId: true,
        startedAt: true,
        grossAmountCents: true,
        netAmountCents: true,
        paymentMethod: true,
        fareType: true,
        liquidationStatus: true,
        paymentValidated: true,
        driverPlatformAccountId: true,
        ingestSource: true,
      },
    }),
  );

  console.log("\nAll trips 26/06 (Madrid day):");
  for (const t of trips) {
    const madrid = t.startedAt.toLocaleString("es-ES", { timeZone: "Europe/Madrid" });
    console.log({
      platform: t.platform,
      madrid,
      gross: Number(t.grossAmountCents) / 100,
      payment: t.paymentMethod,
      fareType: t.fareType,
      status: t.liquidationStatus,
      validated: t.paymentValidated,
      ext: t.externalTripId,
      dpa: t.driverPlatformAccountId?.slice(0, 8),
      ingest: t.ingestSource,
    });
  }

  const fn1660 = trips.find(
    (t) => t.platform === RidePlatform.FREENOW && Number(t.grossAmountCents) === 1660,
  );
  if (fn1660) {
    console.log("\n16.60 FN trip found:", fn1660.id, "status:", fn1660.liquidationStatus);
  } else {
    console.log("\n16.60 FN trip NOT in DB for this day");
  }

  const pending = await withTenant(tenant.id, (tx) =>
    tx.trip.count({
      where: { tenantId: tenant.id, driverId: driver.id, liquidationStatus: "pending" },
    }),
  );
  console.log("\nPending trips total:", pending);

  const liq = await withTenant(tenant.id, (tx) =>
    tx.shiftLiquidation.findMany({
      where: { tenantId: tenant.id, driverId: driver.id },
      orderBy: { closedAt: "desc" },
      take: 3,
      select: { id: true, closedAt: true, periodFrom: true, periodTo: true, tripIds: true, platform: true },
    }),
  );
  console.log("\nRecent liquidations:");
  for (const l of liq) {
    const ids = Array.isArray(l.tripIds) ? (l.tripIds as string[]) : [];
    const has1660 = ids.includes("af7afb04-5126-4cf2-af09-f12348f38705");
    console.log({
      closedAt: l.closedAt?.toISOString(),
      platform: l.platform,
      tripCount: ids.length,
      includes1660Fn: has1660,
    });
  }
}

main().catch(console.error);
