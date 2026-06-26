/**
 * Debug shift payment totals for a driver.
 * Usage: tsx src/cli/inspect-shift-payment-totals.ts trevino "Samer"
 */
import "../load-env.js";
import { withoutTenant } from "@fleethub/db";
import {
  resolveTripPaymentDisplayAmounts,
  tripGrossCents,
  tripPaymentDisplayBalanced,
} from "@fleethub/auth/trip-payment-amounts";

async function main() {
  const slug = process.argv[2] ?? "trevino";
  const name = process.argv[3] ?? "Samer";
  const platform = (process.argv[4] ?? "UBER").toUpperCase();

  const tenant = await withoutTenant((tx) =>
    tx.tenant.findFirst({ where: { slug }, select: { id: true, slug: true } }),
  );
  if (!tenant) throw new Error(`tenant ${slug} not found`);

  const driver = await withoutTenant((tx) =>
    tx.driver.findFirst({
      where: { tenantId: tenant.id, fullName: { contains: name, mode: "insensitive" } },
      select: { id: true, fullName: true },
    }),
  );
  if (!driver) throw new Error(`driver matching "${name}" not found`);

  const trips = await withoutTenant((tx) =>
    tx.trip.findMany({
      where: {
        tenantId: tenant.id,
        driverId: driver.id,
        platform: platform as "UBER" | "FREENOW",
        liquidationStatus: "pending",
      },
      orderBy: { startedAt: "asc" },
      select: {
        id: true,
        startedAt: true,
        grossAmountCents: true,
        netAmountCents: true,
        appPaymentCents: true,
        cashPaymentCents: true,
        cardPaymentCents: true,
        paymentMethod: true,
        paymentValidated: true,
        tipCents: true,
      },
    }),
  );

  let grossSum = 0;
  let appSum = 0;
  let cashSum = 0;
  let cardSum = 0;
  let unbalanced = 0;

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
    const split = resolveTripPaymentDisplayAmounts(input);
    grossSum += g;
    appSum += Number(split.app);
    cashSum += Number(split.cash);
    cardSum += Number(split.card);
    const bal = tripPaymentDisplayBalanced(input);
    const splitSum = Number(split.app) + Number(split.cash) + Number(split.card);
    if (!bal || splitSum !== g) {
      unbalanced += 1;
      console.log(
        "UNBALANCED",
        t.startedAt.toISOString(),
        {
          g: g / 100,
          net: Number(t.netAmountCents ?? 0) / 100,
          app: Number(split.app) / 100,
          cash: Number(split.cash) / 100,
          card: Number(split.card) / 100,
          splitSum: splitSum / 100,
          method: t.paymentMethod,
          validated: t.paymentValidated,
          raw: {
            app: t.appPaymentCents,
            cash: t.cashPaymentCents,
            card: t.cardPaymentCents,
          },
        },
      );
    }
  }

  console.log("tenant", tenant.slug);
  console.log("driver", driver.fullName);
  console.log("platform", platform);
  console.log("trips", trips.length);
  console.log("importe (gross sum)", grossSum / 100);
  console.log("pago app", appSum / 100);
  console.log("efectivo", cashSum / 100);
  console.log("tarjeta", cardSum / 100);
  console.log("app+efectivo", (appSum + cashSum) / 100);
  console.log("app+cash+card", (appSum + cashSum + cardSum) / 100);
  console.log(
    "diff app+cash+card vs importe",
    (appSum + cashSum + cardSum - grossSum) / 100,
  );
  console.log("unbalanced trips", unbalanced);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
