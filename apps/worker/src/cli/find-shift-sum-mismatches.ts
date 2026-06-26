import "../load-env.js";
import { withoutTenant } from "@fleethub/db";
import { tripGrossCents, resolveTripPaymentDisplayAmounts } from "@fleethub/auth/trip-payment-amounts";
import { isCollectiblePaymentTrip } from "@fleethub/auth/trip-payment-buckets";

async function main() {
  const slug = process.argv[2] ?? "trevino";
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findFirst({ where: { slug }, select: { id: true } }),
  );
  if (!tenant) throw new Error("tenant not found");

  const trips = await withoutTenant((tx) =>
    tx.trip.findMany({
      where: {
        tenantId: tenant.id,
        startedAt: { gte: new Date(Date.now() - 14 * 864e5) },
      },
      select: {
        driverId: true,
        platform: true,
        startedAt: true,
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

  const groups = new Map<string, typeof trips>();
  for (const t of trips) {
    const day = t.startedAt.toISOString().slice(0, 10);
    const key = `${t.driverId}|${t.platform}|${day}`;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  for (const [key, list] of groups) {
    let importe = 0;
    let app = 0;
    let cash = 0;
    let appColl = 0;
    let cashColl = 0;
    let legacyGross = 0;
    for (const t of list) {
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
      importe += g;
      app += Number(split.app);
      cash += Number(split.cash);
      legacyGross += Number(t.grossAmountCents ?? t.netAmountCents ?? 0);
      if (isCollectiblePaymentTrip(t.paymentValidated)) {
        appColl += Number(split.app);
        cashColl += Number(split.cash);
      }
    }
    const diff = app + cash - importe;
    const mainDiff = appColl + cashColl - legacyGross;
    if (Math.abs(diff) > 500 || Math.abs(mainDiff) > 500) {
      const [driverId, platform, day] = key.split("|");
      console.log({
        driver: list[0]!.driver.fullName,
        platform,
        day,
        trips: list.length,
        importe: importe / 100,
        legacyImporte: legacyGross / 100,
        appPlusCash: (app + cash) / 100,
        appPlusCashColl: (appColl + cashColl) / 100,
        diffDetail: diff / 100,
        diffMainTable: mainDiff / 100,
      });
    }
  }
}
main();
