import "../load-env.js";
import { RidePlatform, withTenant, withoutTenant } from "@fleethub/db";

async function main() {
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug: "cosculluela" }, select: { id: true } }),
  );
  if (!tenant) return;

  const driver = await withTenant(tenant.id, (tx) =>
    tx.driver.findFirst({
      where: { fullName: { contains: "Claymington", mode: "insensitive" } },
      select: {
        id: true,
        fullName: true,
        company: { select: { legalName: true } },
        driverPlatformAccounts: {
          where: { platform: RidePlatform.FREENOW },
          select: { externalDriverId: true, metadata: true },
        },
      },
    }),
  );
  if (!driver) {
    console.log("Driver not found");
    return;
  }

  console.log(driver.fullName, "|", driver.company.legalName);
  console.log("FN ID:", driver.driverPlatformAccounts[0]?.externalDriverId);

  const dayStart = new Date("2026-07-01T00:00:00+02:00");
  const dayEnd = new Date("2026-07-01T23:59:59.999+02:00");

  const trips = await withTenant(tenant.id, (tx) =>
    tx.trip.findMany({
      where: {
        tenantId: tenant.id,
        driverId: driver.id,
        platform: RidePlatform.FREENOW,
        startedAt: { gte: dayStart, lte: dayEnd },
      },
      orderBy: { startedAt: "asc" },
      select: {
        externalTripId: true,
        startedAt: true,
        grossAmountCents: true,
        platformFeeCents: true,
        platformBonusCents: true,
        netAmountCents: true,
        tipCents: true,
        tollCents: true,
      },
    }),
  );

  let totalBonus = 0n;
  let totalGross = 0n;
  let totalFee = 0n;
  for (const t of trips) {
    const madrid = t.startedAt.toLocaleString("es-ES", { timeZone: "Europe/Madrid" });
    console.log({
      madrid,
      gross: Number(t.grossAmountCents) / 100,
      fee: Number(t.platformFeeCents ?? 0n) / 100,
      primas: Number(t.platformBonusCents ?? 0n) / 100,
      net: Number(t.netAmountCents ?? 0n) / 100,
      ext: t.externalTripId,
    });
    totalBonus += t.platformBonusCents ?? 0n;
    totalGross += t.grossAmountCents ?? 0n;
    totalFee += t.platformFeeCents ?? 0n;
  }
  console.log("\nTotals:", {
    trips: trips.length,
    gross: Number(totalGross) / 100,
    fee: Number(totalFee) / 100,
    primas: Number(totalBonus) / 100,
  });
}

main().catch(console.error);
