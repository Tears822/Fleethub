import "../load-env.js";
import { prisma, RidePlatform, withTenant, withoutTenant } from "@fleethub/db";
import { enrichFreenowTripsWithDriverEarnings } from "../lib/freenow-earnings-mapper.js";
import { freenowBookingToUpsert } from "../lib/freenow-booking-mapper.js";
import { resolveFreenowPublicCompanyIdForDriver } from "../lib/freenow-company-map.js";
import { tenantCalendarDayKey } from "@fleethub/auth/display-timezone";

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const dryRun = process.argv.includes("--dry-run");
  const sinceArg = process.argv.find((a) => a.startsWith("--since="))?.slice("--since=".length);
  const since = sinceArg ? new Date(`${sinceArg}T00:00:00+02:00`) : null;
  const slug = args[0]?.trim() ?? "cosculluela";

  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug }, select: { id: true, name: true } }),
  );
  if (!tenant) throw new Error(`tenant ${slug} not found`);

  const trips = await withTenant(tenant.id, (tx) =>
    tx.trip.findMany({
      where: { tenantId: tenant.id, platform: RidePlatform.FREENOW },
      select: {
        id: true,
        externalTripId: true,
        startedAt: true,
        grossAmountCents: true,
        platformFeeCents: true,
        platformBonusCents: true,
        netAmountCents: true,
        tipCents: true,
        tollCents: true,
        paymentMethod: true,
        paymentValidated: true,
        fareType: true,
        cashPaymentCents: true,
        cardPaymentCents: true,
        appPaymentCents: true,
        driverId: true,
        driver: { select: { fullName: true } },
        driverPlatformAccount: {
          select: { externalDriverId: true, metadata: true },
        },
      },
      orderBy: { startedAt: "asc" },
    }),
  );

  type DriverDayKey = string;
  const groups = new Map<
    DriverDayKey,
    {
      driverId: string;
      driverName: string;
      dayKey: string;
      publicDriverId: string;
      companyId: string;
      trips: typeof trips;
    }
  >();

  for (const trip of trips) {
    if (since && trip.startedAt < since) continue;
    const dpa = trip.driverPlatformAccount;
    const ext = dpa?.externalDriverId?.trim();
    if (!ext) continue;
    const dayKey = tenantCalendarDayKey(trip.startedAt);
    const companyId = await resolveFreenowPublicCompanyIdForDriver(
      tenant.id,
      trip.driverId,
      dpa.metadata,
    );
    const key = `${trip.driverId}|${dayKey}|${companyId}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        driverId: trip.driverId,
        driverName: trip.driver.fullName,
        dayKey,
        publicDriverId: ext,
        companyId,
        trips: [],
      };
      groups.set(key, group);
    }
    group.trips.push(trip);
  }

  let updated = 0;
  console.log(`Re-enrich ${groups.size} driver-day group(s) for ${tenant.name}${dryRun ? " (dry-run)" : ""}`);

  for (const group of groups.values()) {
    const upserts = group.trips.map((t) =>
      freenowBookingToUpsert({
        id: t.externalTripId,
        state: "ACCOMPLISHED",
        pickupDate: t.startedAt.toISOString(),
        dropoffDate: t.startedAt.toISOString(),
        paymentMethod: t.paymentMethod?.toUpperCase() ?? "APP",
        tourValue: {
          amount: Number(t.grossAmountCents ?? 0n) / 100,
          tip: Number(t.tipCents ?? 0n) / 100,
          toll: Number(t.tollCents ?? 0n) / 100,
          taxPercentage:
            t.platformFeeCents && t.grossAmountCents
              ? Math.round((Number(t.platformFeeCents) / Number(t.grossAmountCents)) * 100)
              : undefined,
        },
      } as Parameters<typeof freenowBookingToUpsert>[0]),
    ).filter((u): u is NonNullable<typeof u> => u != null);

    if (upserts.length === 0) continue;

    const from = new Date(`${group.dayKey}T00:00:00+02:00`);
    const to = new Date(`${group.dayKey}T23:59:59.999+02:00`);
    const enriched = await enrichFreenowTripsWithDriverEarnings({
      publicCompanyId: group.companyId,
      publicDriverId: group.publicDriverId,
      from,
      to,
      trips: upserts,
    });

    const byExt = new Map(enriched.trips.map((t) => [t.externalTripId, t]));
    for (const row of group.trips) {
      const api = byExt.get(row.externalTripId);
      if (!api) continue;
      const oldBonus = row.platformBonusCents ?? 0n;
      const newBonus = api.platformBonusCents ?? 0n;
      const oldFee = row.platformFeeCents ?? 0n;
      const newFee = api.platformFeeCents ?? oldFee;
      if (oldBonus === newBonus && oldFee === newFee) continue;

      if (dryRun) {
        console.log(
          `  ${group.driverName} ${group.dayKey}: ${row.externalTripId.slice(0, 12)} primas ${Number(oldBonus) / 100} → ${Number(newBonus) / 100}`,
        );
      } else {
        await withTenant(tenant.id, (tx) =>
          tx.trip.update({
            where: { id: row.id },
            data: {
              platformBonusCents: newBonus,
              platformFeeCents: newFee > 0n ? newFee : row.platformFeeCents,
              netAmountCents: api.netAmountCents ?? row.netAmountCents,
              appPaymentCents: api.appPaymentCents ?? row.appPaymentCents,
              cashPaymentCents: api.cashPaymentCents ?? row.cashPaymentCents,
              cardPaymentCents: api.cardPaymentCents ?? row.cardPaymentCents,
            },
          }),
        );
      }
      updated += 1;
    }
  }

  console.log(`${dryRun ? "Would update" : "Updated"} ${updated} trip(s)`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
