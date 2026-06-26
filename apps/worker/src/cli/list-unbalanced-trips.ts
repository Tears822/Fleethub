import "../load-env.js";
import { withoutTenant, withTenantRls } from "@fleethub/db";
import {
  resolveTripPaymentAmounts,
  tripGrossCents,
  tripPaymentDisplayBalanced,
} from "@fleethub/auth/trip-payment-amounts";

async function main() {
  const slug = process.argv[2] ?? "trevino";
  const name = process.argv[3] ?? "Samer";
  const platform = (process.argv[4] ?? "UBER").toUpperCase();

  const tenant = await withoutTenant((tx) =>
    tx.tenant.findFirst({ where: { slug }, select: { id: true } }),
  );
  const driver = await withoutTenant((tx) =>
    tx.driver.findFirst({
      where: { tenantId: tenant!.id, fullName: { contains: name, mode: "insensitive" } },
      select: { id: true, fullName: true },
    }),
  );

  const trips = await withTenantRls(tenant!.id, (tx) =>
    tx.trip.findMany({
      where: {
        tenantId: tenant!.id,
        driverId: driver!.id,
        platform: platform as "UBER" | "FREENOW",
        liquidationStatus: "pending",
      },
      orderBy: { startedAt: "asc" },
      select: {
        id: true,
        startedAt: true,
        grossAmountCents: true,
        netAmountCents: true,
        paymentMethod: true,
        cashPaymentCents: true,
        cardPaymentCents: true,
        appPaymentCents: true,
        tipCents: true,
        paymentValidated: true,
      },
    }),
  );

  console.log(driver!.fullName, platform, trips.length, "pending trips");

  for (const t of trips) {
    const input = {
      grossAmountCents: t.grossAmountCents,
      netAmountCents: t.netAmountCents,
      paymentMethod: t.paymentMethod,
      cashPaymentCents: t.cashPaymentCents,
      cardPaymentCents: t.cardPaymentCents,
      appPaymentCents: t.appPaymentCents,
    };
    if (!tripPaymentDisplayBalanced(input)) {
      const split = resolveTripPaymentAmounts(input);
      const g = tripGrossCents(input);
      console.log({
        at: t.startedAt.toISOString(),
        gross: Number(g) / 100,
        net: Number(t.netAmountCents ?? 0) / 100,
        method: t.paymentMethod,
        split: {
          app: Number(split.app) / 100,
          cash: Number(split.cash) / 100,
          card: Number(split.card) / 100,
          sum: Number(split.app + split.cash + split.card) / 100,
        },
        raw: {
          app: t.appPaymentCents,
          cash: t.cashPaymentCents,
          card: t.cardPaymentCents,
        },
        validated: t.paymentValidated,
      });
    }
  }
}
main();
