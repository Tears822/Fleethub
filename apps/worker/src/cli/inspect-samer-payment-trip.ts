/**
 * Inspect Samer Kabbani payment alert trip (BADAVI / cosculluela).
 * Usage: npx tsx src/cli/inspect-samer-payment-trip.ts [tenant-slug]
 */
import "../load-env.js";
import { withoutTenant } from "@fleethub/db";
import {
  derivePaymentEditMode,
  tripNeedsManualPaymentReview,
  resolveTripPaymentDisplayAmounts,
} from "@fleethub/auth/trip-payment-amounts";

async function main() {
  const slug = process.argv[2]?.trim() ?? "cosculluela";

  const tenant = await withoutTenant((tx) =>
    tx.tenant.findFirst({ where: { slug }, select: { id: true, slug: true } }),
  );
  if (!tenant) throw new Error(`tenant ${slug} not found`);

  const driver = await withoutTenant((tx) =>
    tx.driver.findFirst({
      where: { tenantId: tenant.id, fullName: { contains: "SAMER", mode: "insensitive" } },
      select: { id: true, fullName: true },
    }),
  );
  if (!driver) throw new Error(`Samer not found in ${slug}`);

  const unvalidated = await withoutTenant((tx) =>
    tx.trip.findMany({
      where: {
        tenantId: tenant.id,
        driverId: driver.id,
        platform: "UBER",
        paymentValidated: false,
      },
      orderBy: { startedAt: "desc" },
      take: 20,
      select: {
        id: true,
        externalTripId: true,
        startedAt: true,
        grossAmountCents: true,
        netAmountCents: true,
        tipCents: true,
        paymentMethod: true,
        paymentValidated: true,
        cashPaymentCents: true,
        cardPaymentCents: true,
        appPaymentCents: true,
        fareType: true,
        ingestSource: true,
        liquidationStatus: true,
      },
    }),
  );

  const target = await withoutTenant((tx) =>
    tx.trip.findMany({
      where: {
        tenantId: tenant.id,
        driverId: driver.id,
        platform: "UBER",
        grossAmountCents: 1970n,
        startedAt: {
          gte: new Date("2026-06-27T19:00:00Z"),
          lte: new Date("2026-06-28T02:00:00Z"),
        },
      },
      select: {
        id: true,
        externalTripId: true,
        startedAt: true,
        grossAmountCents: true,
        netAmountCents: true,
        tipCents: true,
        paymentMethod: true,
        paymentValidated: true,
        cashPaymentCents: true,
        cardPaymentCents: true,
        appPaymentCents: true,
        fareType: true,
        ingestSource: true,
        liquidationStatus: true,
      },
    }),
  );

  console.log("tenant", tenant.slug);
  console.log("driver", driver.fullName);
  console.log("unvalidated count", unvalidated.length);
  console.log("19.70€ trip matches", target.length);

  for (const list of [unvalidated, target]) {
    for (const t of list) {
      const input = {
        grossAmountCents: t.grossAmountCents,
        netAmountCents: t.netAmountCents,
        paymentMethod: t.paymentMethod,
        cashPaymentCents: t.cashPaymentCents,
        cardPaymentCents: t.cardPaymentCents,
        appPaymentCents: t.appPaymentCents,
        paymentValidated: t.paymentValidated,
      };
      const mode = derivePaymentEditMode(input);
      const split = resolveTripPaymentDisplayAmounts(input);
      console.log("---");
      console.log(t.startedAt.toISOString(), t.fareType, t.liquidationStatus);
      console.log(
        "gross",
        Number(t.grossAmountCents ?? 0) / 100,
        "net",
        Number(t.netAmountCents ?? 0) / 100,
        "tip",
        Number(t.tipCents ?? 0) / 100,
      );
      console.log("method", t.paymentMethod, "validated", t.paymentValidated, "mode", mode);
      console.log(
        "split display app/cash/card",
        Number(split.app) / 100,
        Number(split.cash) / 100,
        Number(split.card) / 100,
      );
      console.log("raw app/cash/card", t.appPaymentCents, t.cashPaymentCents, t.cardPaymentCents);
      console.log("needsManualReview", tripNeedsManualPaymentReview(input));
      console.log("ingest", t.ingestSource, "ext", t.externalTripId.slice(0, 12));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
