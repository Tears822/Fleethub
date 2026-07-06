import "../load-env.js";
import { withTenant, withoutTenant } from "@fleethub/db";
import {
  resolveTripPaymentAmounts,
  resolveTripPaymentDisplayAmounts,
  tripGrossCents,
} from "@fleethub/auth/trip-payment-amounts";
import { resolveTripFeeCents } from "@fleethub/auth/shift-liquidation";

async function main() {
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug: "cosculluela" }, select: { id: true } }),
  );
  if (!tenant) {
    console.log("tenant not found");
    return;
  }

  const driver = await withTenant(tenant.id, (tx) =>
    tx.driver.findFirst({
      where: { fullName: { equals: "SHAHID IMRAN GONDAL", mode: "insensitive" } },
      select: { id: true, fullName: true },
    }),
  );
  if (!driver) {
    console.log("driver not found");
    return;
  }

  const from = new Date("2026-06-01T00:00:00+02:00");
  const to = new Date("2026-07-31T23:59:59+02:00");
  const trips = await withTenant(tenant.id, (tx) =>
    tx.trip.findMany({
      where: {
        tenantId: tenant.id,
        driverId: driver.id,
        liquidationStatus: "closed",
        startedAt: { gte: from, lte: to },
      },
      orderBy: { startedAt: "asc" },
      select: {
        platform: true,
        startedAt: true,
        endedAt: true,
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
        externalTripId: true,
        platformBonusCents: true,
        tollCents: true,
      },
    }),
  );

  let grossSum = BigInt(0);
  let paySum = BigInt(0);
  let feeSum = BigInt(0);
  let appSum = BigInt(0);
  const mismatches: Array<Record<string, unknown>> = [];

  for (const t of trips) {
    const gross = tripGrossCents(t);
    const disp = resolveTripPaymentDisplayAmounts(t);
    const pay = disp.app + disp.cash + disp.card;
    grossSum += gross;
    paySum += pay;
    feeSum += resolveTripFeeCents(t);
    appSum += disp.app;
    if (pay !== gross && gross > BigInt(0)) {
      const split = resolveTripPaymentAmounts(t);
      mismatches.push({
        id: t.externalTripId?.slice(0, 12),
        gross: Number(gross) / 100,
        pay: Number(pay) / 100,
        diff: Number(gross - pay) / 100,
        net: Number(t.netAmountCents ?? 0) / 100,
        fee: Number(t.platformFeeCents ?? 0) / 100,
        method: t.paymentMethod,
        validated: t.paymentValidated,
        splitSum: Number(split.app + split.cash + split.card) / 100,
        fareType: t.fareType,
      });
    }
  }

  console.log(driver.fullName, "trips", trips.length);
  console.log("agg gross", (Number(grossSum) / 100).toFixed(2));
  console.log("agg pay", (Number(paySum) / 100).toFixed(2));
  console.log("agg app", (Number(appSum) / 100).toFixed(2));
  console.log("agg fee", (Number(feeSum) / 100).toFixed(2));
  console.log("agg diff", (Number(grossSum - paySum) / 100).toFixed(2));
  console.log("mismatch trips", mismatches.length);
  console.log(JSON.stringify(mismatches, null, 2));
}

main().catch(console.error);
