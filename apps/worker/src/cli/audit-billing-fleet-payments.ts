import "../load-env.js";
import { withTenant, withoutTenant } from "@fleethub/db";
import { tripGrossCents, resolveTripPaymentDisplayAmounts } from "@fleethub/auth/trip-payment-amounts";
import { resolveTripFeeCents } from "@fleethub/auth/shift-liquidation";

async function main() {
  const slug = process.argv[2] ?? "cosculluela";
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug }, select: { id: true } }),
  );
  if (!tenant) {
    console.log("tenant not found");
    return;
  }

  const from = new Date("2026-06-01T00:00:00+02:00");
  const to = new Date("2027-07-31T23:59:59+02:00");
  const trips = await withTenant(tenant.id, (tx) =>
    tx.trip.findMany({
      where: {
        tenantId: tenant.id,
        liquidationStatus: "closed",
        startedAt: { gte: from, lte: to },
      },
      select: {
        driverId: true,
        driver: { select: { fullName: true } },
        grossAmountCents: true,
        netAmountCents: true,
        platformFeeCents: true,
        paymentMethod: true,
        cashPaymentCents: true,
        cardPaymentCents: true,
        appPaymentCents: true,
        paymentValidated: true,
        tipCents: true,
        fareType: true,
      },
    }),
  );

  const byDriver = new Map<
    string,
    { name: string; gross: bigint; pay: bigint; fee: bigint; count: number }
  >();
  let tripMismatches = 0;

  for (const t of trips) {
    const gross = tripGrossCents(t);
    const disp = resolveTripPaymentDisplayAmounts(t);
    const pay = disp.app + disp.cash + disp.card;
    if (gross > BigInt(0) && pay !== gross) tripMismatches++;

    let agg = byDriver.get(t.driverId);
    if (!agg) {
      agg = { name: t.driver.fullName, gross: BigInt(0), pay: BigInt(0), fee: BigInt(0), count: 0 };
      byDriver.set(t.driverId, agg);
    }
    agg.gross += gross;
    agg.pay += pay;
    agg.fee += resolveTripFeeCents(t);
    agg.count += 1;
  }

  const driverDiffs: Array<{ name: string; count: number; payDiff: number; gross: number; pay: number }> =
    [];
  for (const agg of byDriver.values()) {
    const payDiff = Number(agg.gross - agg.pay) / 100;
    if (Math.abs(payDiff) > 0.005) {
      driverDiffs.push({
        name: agg.name,
        count: agg.count,
        payDiff,
        gross: Number(agg.gross) / 100,
        pay: Number(agg.pay) / 100,
      });
    }
  }
  driverDiffs.sort((a, b) => Math.abs(b.payDiff) - Math.abs(a.payDiff));

  console.log(`tenant ${slug}`);
  console.log("closed trips", trips.length, "drivers", byDriver.size);
  console.log("trip-level pay !== gross", tripMismatches);
  console.log("drivers with aggregate pay diff", driverDiffs.length);
  if (driverDiffs.length > 0) {
    console.log("top diffs:", driverDiffs.slice(0, 10));
  }
}

main().catch(console.error);
