/**
 * Audita todos los grupos conductor+plataforma pendientes: tabla vs detalle cuadran.
 * Usage: npx tsx scripts/verify-cerrar-turnos-all.ts [slug1 slug2 ...]
 */
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: path.join(root, ".env") });
loadEnv({ path: path.join(root, "apps/worker/.env"), override: true });

import {
  resolveTripPaymentDisplayAmounts,
  tripGrossCents,
} from "@fleethub/auth/trip-payment-amounts";
import { withoutTenant, withTenantRls, RidePlatform } from "@fleethub/db";

type TripRow = {
  platform: RidePlatform;
  driverId: string;
  grossAmountCents: bigint | null;
  netAmountCents: bigint | null;
  paymentMethod: string | null;
  cashPaymentCents: bigint | null;
  cardPaymentCents: bigint | null;
  appPaymentCents: bigint | null;
  paymentValidated: boolean;
  driver: { fullName: string };
};

function tableAgg(trips: TripRow[], platform: RidePlatform) {
  let gross = BigInt(0);
  let app = BigInt(0);
  let cash = BigInt(0);
  let card = BigInt(0);
  let count = 0;
  for (const t of trips) {
    if (t.platform !== platform) continue;
    count += 1;
    const g = tripGrossCents({
      grossAmountCents: t.grossAmountCents,
      netAmountCents: t.netAmountCents,
    });
    gross += g;
    const split = resolveTripPaymentDisplayAmounts({
      grossAmountCents: t.grossAmountCents,
      netAmountCents: t.netAmountCents,
      paymentMethod: t.paymentMethod,
      cashPaymentCents: t.cashPaymentCents,
      cardPaymentCents: t.cardPaymentCents,
      appPaymentCents: t.appPaymentCents,
    });
    app += split.app;
    cash += split.cash;
    card += split.card;
  }
  return { count, gross, app, cash, card };
}

async function auditTenant(slug: string) {
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findFirst({ where: { slug }, select: { id: true, slug: true } }),
  );
  if (!tenant) {
    console.log(`SKIP ${slug}: tenant not found`);
    return { ok: 0, fail: 0 };
  }

  const trips = await withTenantRls(tenant.id, (tx) =>
    tx.trip.findMany({
      where: { tenantId: tenant.id, liquidationStatus: "pending" },
      select: {
        platform: true,
        driverId: true,
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

  let ok = 0;
  let fail = 0;
  const failures: string[] = [];

  for (const [key, groupTrips] of groups) {
    const platform = groupTrips[0]!.platform;
    const name = groupTrips[0]!.driver.fullName;
    const agg = tableAgg(groupTrips, platform);
    const pay = agg.app + agg.cash + agg.card;
    const balanced = pay === agg.gross;
    if (balanced) {
      ok += 1;
    } else {
      fail += 1;
      const eur = (c: bigint) => (Number(c) / 100).toFixed(2);
      failures.push(
        `  FAIL ${name} / ${platform}: importe ${eur(agg.gross)} pay ${eur(pay)} diff ${eur(pay - agg.gross)} (${agg.count} viajes)`,
      );
    }
  }

  console.log(`\n=== ${tenant.slug} === ${groups.size} grupos, ${trips.length} viajes pendientes`);
  console.log(`OK: ${ok}, FAIL: ${fail}`);
  if (failures.length) console.log(failures.join("\n"));
  return { ok, fail };
}

async function main() {
  const slugs =
    process.argv.length > 2
      ? process.argv.slice(2)
      : ["trevino", "trade-taxi-sl", "cosculluela"];

  let totalOk = 0;
  let totalFail = 0;
  for (const slug of slugs) {
    const { ok, fail } = await auditTenant(slug);
    totalOk += ok;
    totalFail += fail;
  }

  console.log(`\n--- Total --- OK: ${totalOk}, FAIL: ${totalFail}`);
  if (totalFail > 0) process.exit(1);
  console.log("All pending driver/platform groups balance (importe = app + efectivo + tarjeta).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
