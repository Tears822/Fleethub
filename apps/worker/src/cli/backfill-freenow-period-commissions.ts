/**
 * Re-enrich FreeNow commissions per driver over each driver's full trip span
 * (uses period earnings when tour count matches — aligns with FreeNow PDF totals).
 *
 * Usage:
 *   npx tsx src/cli/backfill-freenow-period-commissions.ts cosculluela
 */
import "../load-env.js";
import { tenantCalendarDayKey, tenantDayEndFromIso, tenantDayStartFromIso } from "@fleethub/auth/display-timezone";
import { prisma, RidePlatform, withTenant, withoutTenant } from "@fleethub/db";
import { freenowBookingToUpsert } from "../lib/freenow-booking-mapper.js";
import { enrichFreenowTripsWithDriverEarnings } from "../lib/freenow-earnings-mapper.js";
import { resolveFreenowPublicCompanyIdForDriver } from "../lib/freenow-company-map.js";

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const dryRun = process.argv.includes("--dry-run");
  const slug = args[0]?.trim() ?? "cosculluela";
  const fromArg = process.argv.find((a) => a.startsWith("--from="))?.slice("--from=".length);
  const toArg = process.argv.find((a) => a.startsWith("--to="))?.slice("--to=".length);
  const rangeFrom = fromArg ? tenantDayStartFromIso(fromArg) : null;
  const rangeTo = toArg ? tenantDayEndFromIso(toArg) : null;

  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug }, select: { id: true, name: true } }),
  );
  if (!tenant) throw new Error(`tenant ${slug} not found`);

  const trips = await withTenant(tenant.id, (tx) =>
    tx.trip.findMany({
      where: {
        tenantId: tenant.id,
        platform: RidePlatform.FREENOW,
        ...(rangeFrom || rangeTo
          ? {
              startedAt: {
                ...(rangeFrom ? { gte: rangeFrom } : {}),
                ...(rangeTo ? { lte: rangeTo } : {}),
              },
            }
          : {}),
      },
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
        driverPlatformAccount: {
          select: { externalDriverId: true, metadata: true },
        },
      },
      orderBy: { startedAt: "asc" },
    }),
  );

  type Group = {
    publicDriverId: string;
    companyId: string;
    periodFrom: Date;
    periodTo: Date;
    rows: typeof trips;
  };
  const groups = new Map<string, Group>();

  for (const trip of trips) {
    const ext = trip.driverPlatformAccount?.externalDriverId?.trim();
    if (!ext) continue;
    const companyId = await resolveFreenowPublicCompanyIdForDriver(
      tenant.id,
      trip.driverId,
      trip.driverPlatformAccount?.metadata,
    );
    const dayKey = tenantCalendarDayKey(trip.startedAt);
    const monthKey = dayKey.slice(0, 7);
    const key =
      rangeFrom && rangeTo
        ? `${trip.driverId}|${companyId}`
        : `${trip.driverId}|${companyId}|${monthKey}`;
    let group = groups.get(key);
    if (!group) {
      const [year, month] = monthKey.split("-").map(Number);
      const lastDay = new Date(year!, month!, 0).getDate();
      const monthEndKey = `${monthKey}-${String(lastDay).padStart(2, "0")}`;
      group = {
        publicDriverId: ext,
        companyId,
        periodFrom: tenantDayStartFromIso(`${monthKey}-01`),
        periodTo: tenantDayEndFromIso(monthEndKey),
        rows: [],
      };
      groups.set(key, group);
    }
    group.rows.push(trip);
  }

  console.log(
    `Period re-enrich ${groups.size} driver group(s) for ${tenant.name}${dryRun ? " (dry-run)" : ""}`,
  );

  let updated = 0;
  for (const group of groups.values()) {
    const upserts = group.rows
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

    const enriched = await enrichFreenowTripsWithDriverEarnings({
      publicCompanyId: group.companyId,
      publicDriverId: group.publicDriverId,
      from: rangeFrom ?? group.periodFrom,
      to: rangeTo ?? group.periodTo,
      trips: upserts,
    });

    const byExt = new Map(enriched.trips.map((t) => [t.externalTripId, t]));
    for (const row of group.rows) {
      const api = byExt.get(row.externalTripId);
      if (!api) continue;
      const newFee = api.platformFeeCents ?? row.platformFeeCents;
      const newNet = api.netAmountCents ?? row.netAmountCents;
      if (
        newFee === row.platformFeeCents &&
        newNet === row.netAmountCents &&
        (api.platformBonusCents ?? 0n) === (row.platformBonusCents ?? 0n)
      ) {
        continue;
      }

      if (!dryRun) {
        await withTenant(tenant.id, (tx) =>
          tx.trip.update({
            where: { id: row.id },
            data: {
              platformFeeCents: newFee,
              platformBonusCents: api.platformBonusCents ?? 0n,
              netAmountCents: newNet,
              appPaymentCents: api.appPaymentCents,
              cashPaymentCents: api.cashPaymentCents,
              cardPaymentCents: api.cardPaymentCents,
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
