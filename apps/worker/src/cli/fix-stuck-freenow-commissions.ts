/**
 * Re-enrich FreeNow trips still carrying the old ~10% taxPercentage fee.
 *
 * Usage:
 *   npx tsx src/cli/fix-stuck-freenow-commissions.ts cosculluela
 *   npx tsx src/cli/fix-stuck-freenow-commissions.ts cosculluela --dry-run
 */
import "../load-env.js";
import { prisma, RidePlatform, withTenant, withoutTenant } from "@fleethub/db";
import { tenantCalendarDayKey } from "@fleethub/auth/display-timezone";
import { freenowBookingToUpsert } from "../lib/freenow-booking-mapper.js";
import { enrichFreenowTripsWithDriverEarnings } from "../lib/freenow-earnings-mapper.js";
import { resolveFreenowPublicCompanyIdForDriver } from "../lib/freenow-company-map.js";

function isLegacyTenPctFee(gross: bigint, fee: bigint): boolean {
  if (gross <= 0n || fee <= 0n) return false;
  const ratio = Number(fee) / Number(gross);
  return ratio >= 0.095 && ratio <= 0.105;
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const dryRun = process.argv.includes("--dry-run");
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
        driverId: true,
        driver: { select: { fullName: true } },
        driverPlatformAccount: {
          select: { externalDriverId: true, metadata: true },
        },
      },
      orderBy: { startedAt: "asc" },
    }),
  );

  const stuck = trips.filter(
    (t) =>
      t.grossAmountCents != null &&
      t.platformFeeCents != null &&
      isLegacyTenPctFee(t.grossAmountCents, t.platformFeeCents),
  );

  if (stuck.length === 0) {
    console.log(`No legacy ~10% FreeNow trips for ${tenant.name}`);
    return;
  }

  type Group = {
    driverName: string;
    dayKey: string;
    publicDriverId: string;
    companyId: string;
    trips: typeof stuck;
  };
  const groups = new Map<string, Group>();

  for (const trip of stuck) {
    const ext = trip.driverPlatformAccount?.externalDriverId?.trim();
    if (!ext) continue;
    const dayKey = tenantCalendarDayKey(trip.startedAt);
    const companyId = await resolveFreenowPublicCompanyIdForDriver(
      tenant.id,
      trip.driverId,
      trip.driverPlatformAccount?.metadata,
    );
    const key = `${trip.driverId}|${dayKey}|${companyId}`;
    let group = groups.get(key);
    if (!group) {
      group = {
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

  console.log(
    `Fix ${stuck.length} stuck trip(s) in ${groups.size} driver-day group(s) for ${tenant.name}${dryRun ? " (dry-run)" : ""}`,
  );

  let updated = 0;
  for (const group of groups.values()) {
    const upserts = group.trips
      .map((t) =>
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
          },
        } as Parameters<typeof freenowBookingToUpsert>[0]),
      )
      .filter((u): u is NonNullable<typeof u> => u != null);

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
      if (!api?.platformFeeCents || api.platformFeeCents <= 0n) continue;
      if (api.platformFeeCents === row.platformFeeCents) continue;

      if (dryRun) {
        console.log(
          `  ${group.driverName} ${group.dayKey}: fee ${Number(row.platformFeeCents) / 100} → ${Number(api.platformFeeCents) / 100}`,
        );
      } else {
        await withTenant(tenant.id, (tx) =>
          tx.trip.update({
            where: { id: row.id },
            data: {
              platformFeeCents: api.platformFeeCents,
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
