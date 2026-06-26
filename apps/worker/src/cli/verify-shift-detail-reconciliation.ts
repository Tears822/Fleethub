/**
 * Verify cerrar-turnos reconciliation: Importe === app + efectivo + tarjeta per driver/platform.
 * Usage: tsx src/cli/verify-shift-detail-reconciliation.ts [tenant-slug]
 */
import "../load-env.js";
import { withoutTenant, withTenantRls } from "@fleethub/db";
import {
  resolveTripPaymentDisplayAmounts,
  tripGrossCents,
  tripPaymentDisplayBalanced,
} from "@fleethub/auth/trip-payment-amounts";

type TripRow = {
  driverId: string;
  platform: string;
  grossAmountCents: bigint | null;
  netAmountCents: bigint | null;
  paymentMethod: string | null;
  cashPaymentCents: bigint | null;
  cardPaymentCents: bigint | null;
  appPaymentCents: bigint | null;
  paymentValidated: boolean | null;
  driver: { fullName: string };
};

function tripInput(t: TripRow) {
  return {
    grossAmountCents: t.grossAmountCents,
    netAmountCents: t.netAmountCents,
    paymentMethod: t.paymentMethod,
    cashPaymentCents: t.cashPaymentCents,
    cardPaymentCents: t.cardPaymentCents,
    appPaymentCents: t.appPaymentCents,
  };
}

function importeCents(t: TripRow): bigint {
  const gross = t.grossAmountCents ?? BigInt(0);
  const net = t.netAmountCents ?? BigInt(0);
  return gross > BigInt(0) ? gross : net;
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const includeRecentClosed = process.argv.includes("--recent");
  const daysArg = process.argv.find((a) => a.startsWith("--days="));
  const recentDays = daysArg ? Number(daysArg.split("=")[1]) : 7;
  const slugFilter = args[0]?.trim();

  const tenants = await withoutTenant((tx) =>
    tx.tenant.findMany({
      where: slugFilter
        ? { slug: slugFilter }
        : { commercialStatus: "ACTIVE", slug: { in: ["trevino", "trade-taxi-sl", "cosculluela"] } },
      select: { id: true, slug: true },
    }),
  );

  let okGroups = 0;
  let failGroups = 0;

  for (const tenant of tenants) {
    const trips = await withTenantRls(tenant.id, (tx) =>
      tx.trip.findMany({
        where: {
          tenantId: tenant.id,
          ...(includeRecentClosed
            ? { startedAt: { gte: new Date(Date.now() - recentDays * 864e5) } }
            : { liquidationStatus: "pending" }),
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

    const groups = new Map<string, TripRow[]>();
    for (const t of trips) {
      const key = `${t.driverId}|${t.platform}`;
      const list = groups.get(key) ?? [];
      list.push(t);
      groups.set(key, list);
    }

    console.log(`\n=== ${tenant.slug} (${trips.length} trips, ${groups.size} driver/platform groups) ===`);

    if (trips.length === 0) {
      console.log("  (no trips to verify)");
      continue;
    }

    for (const list of groups.values()) {
      let importe = BigInt(0);
      let app = BigInt(0);
      let cash = BigInt(0);
      let card = BigInt(0);
      let netTotal = BigInt(0);
      let unbalancedTrips = 0;
      let netGtGrossTrips = 0;

      for (const t of list) {
        const input = tripInput(t);
        const ic = importeCents(t);
        const split = resolveTripPaymentDisplayAmounts(input);
        importe += ic;
        app += split.app;
        cash += split.cash;
        card += split.card;
        netTotal += t.netAmountCents ?? BigInt(0);
        const g = tripGrossCents(input);
        const n = t.netAmountCents ?? BigInt(0);
        if (n > g && g > BigInt(0)) netGtGrossTrips += 1;
        if (!tripPaymentDisplayBalanced(input)) unbalancedTrips += 1;
      }

      const paySum = app + cash + card;
      const diffCents = paySum - importe;
      const ok = diffCents === BigInt(0) && unbalancedTrips === 0;
      if (ok) okGroups += 1;
      else failGroups += 1;

      const driver = list[0]!.driver.fullName;
      const platform = list[0]!.platform;
      const status = ok ? "OK" : "FAIL";
      console.log(
        `  [${status}] ${driver} / ${platform}: ${list.length} viajes | Importe ${Number(importe) / 100} | app+efectivo+tarjeta ${Number(paySum) / 100} | diff ${Number(diffCents) / 100} | net total ${Number(netTotal) / 100} | net>gross trips ${netGtGrossTrips} | unbalanced ${unbalancedTrips}`,
      );
    }
  }

  console.log(`\nSummary: ${okGroups} OK, ${failGroups} FAIL`);
  if (failGroups > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
