/**
 * Find drivers with unbalanced payment display totals (cerrar turnos).
 * Usage: tsx src/cli/audit-shift-payment-balance.ts [tenant-slug]
 */
import "../load-env.js";
import { withoutTenant } from "@fleethub/db";
import {
  resolveTripPaymentDisplayAmounts,
  tripGrossCents,
  tripPaymentDisplayBalanced,
} from "@fleethub/auth/trip-payment-amounts";
import { isCollectiblePaymentTrip } from "@fleethub/auth/trip-payment-buckets";

function tripGrossForAgg(trip: {
  grossAmountCents: bigint | null;
  netAmountCents: bigint | null;
}): bigint {
  return tripGrossCents({
    grossAmountCents: trip.grossAmountCents,
    netAmountCents: trip.netAmountCents,
  });
}

function tripGrossLegacyAgg(trip: {
  grossAmountCents: bigint | null;
  netAmountCents: bigint | null;
}): bigint {
  const net = trip.netAmountCents ?? BigInt(0);
  return trip.grossAmountCents ?? net;
}

async function main() {
  const slugFilter = process.argv[2]?.trim();
  const includeClosed = process.argv.includes("--all");

  const tenants = await withoutTenant((tx) =>
    tx.tenant.findMany({
      where: slugFilter ? { slug: slugFilter } : { commercialStatus: "ACTIVE" },
      select: { id: true, slug: true },
    }),
  );

  let totalUnbalanced = 0;

  for (const tenant of tenants) {
    const trips = await withoutTenant((tx) =>
      tx.trip.findMany({
        where: {
          tenantId: tenant.id,
          ...(includeClosed ? {} : { liquidationStatus: "pending" }),
          startedAt: { gte: new Date(Date.now() - 14 * 864e5) },
        },
        select: {
          driverId: true,
          platform: true,
          grossAmountCents: true,
          netAmountCents: true,
          paymentMethod: true,
          cashPaymentCents: true,
          cardPaymentCents: true,
          appPaymentCents: true,
          paymentValidated: true,
          driver: { select: { fullName: true } },
        },
      }),
    );

    const byDriver = new Map<
      string,
      {
        name: string;
        platform: string;
        trips: number;
        grossLegacy: number;
        grossCorrect: number;
        grossCollectible: number;
        app: number;
        appCollectible: number;
        cash: number;
        cashCollectible: number;
        card: number;
        unbalanced: number;
        unvalidated: number;
      }
    >();

    for (const t of trips) {
      const input = {
        grossAmountCents: t.grossAmountCents,
        netAmountCents: t.netAmountCents,
        paymentMethod: t.paymentMethod,
        cashPaymentCents: t.cashPaymentCents,
        cardPaymentCents: t.cardPaymentCents,
        appPaymentCents: t.appPaymentCents,
      };
      const g = Number(tripGrossCents(input));
      if (g <= 0) continue;
      const split = resolveTripPaymentDisplayAmounts(input);
      const legacy = Number(tripGrossLegacyAgg(t));
      const correct = Number(tripGrossForAgg(t));
      const collectible = isCollectiblePaymentTrip(t.paymentValidated);
      const key = `${t.driverId}:${t.platform}`;
      let row = byDriver.get(key);
      if (!row) {
        row = {
          name: t.driver.fullName,
          platform: t.platform,
          trips: 0,
          grossLegacy: 0,
          grossCorrect: 0,
          grossCollectible: 0,
          app: 0,
          appCollectible: 0,
          cash: 0,
          cashCollectible: 0,
          card: 0,
          unbalanced: 0,
          unvalidated: 0,
        };
        byDriver.set(key, row);
      }
      row.trips += 1;
      row.grossLegacy += legacy;
      row.grossCorrect += correct;
      if (collectible) row.grossCollectible += correct;
      row.app += Number(split.app);
      row.cash += Number(split.cash);
      row.card += Number(split.card);
      if (collectible) {
        row.appCollectible += Number(split.app);
        row.cashCollectible += Number(split.cash);
      }
      if (!t.paymentValidated) row.unvalidated += 1;
      if (!tripPaymentDisplayBalanced(input)) row.unbalanced += 1;
    }

    for (const row of byDriver.values()) {
      const paySum = row.app + row.cash + row.card;
      const payCollectible = row.appCollectible + row.cashCollectible + row.card;
      const diffDetail = paySum - row.grossCorrect;
      const diffMainTable = payCollectible - row.grossLegacy;
      const diffMainFixed = payCollectible - row.grossCorrect;
      if (
        row.unbalanced > 0 ||
        Math.abs(diffDetail) > 100 ||
        Math.abs(diffMainTable) > 100 ||
        Math.abs(diffMainFixed) > 100 ||
        row.grossLegacy !== row.grossCorrect
      ) {
        totalUnbalanced += 1;
        console.log(
          JSON.stringify({
            tenant: tenant.slug,
            driver: row.name,
            platform: row.platform,
            trips: row.trips,
            unvalidatedTrips: row.unvalidated,
            importeLegacyAgg: row.grossLegacy / 100,
            importeCorrect: row.grossCorrect / 100,
            importeCollectible: row.grossCollectible / 100,
            appAll: row.app / 100,
            appCollectible: row.appCollectible / 100,
            cashAll: row.cash / 100,
            cashCollectible: row.cashCollectible / 100,
            appPlusCashAll: (row.app + row.cash) / 100,
            appPlusCashCollectible: (row.appCollectible + row.cashCollectible) / 100,
            diffDetailPayVsImporte: diffDetail / 100,
            diffMainTablePayVsLegacyImporte: diffMainTable / 100,
            diffMainTablePayVsCorrectImporte: diffMainFixed / 100,
            unbalancedTrips: row.unbalanced,
          }),
        );
      }
    }
  }

  console.log(`audit done: ${totalUnbalanced} driver/platform row(s) with mismatch`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
