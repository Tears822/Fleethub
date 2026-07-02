/**
 * Inspect BADAVI payment cases reported by tenant.
 * Usage: npx tsx src/cli/run-with-worker-uber-env.ts src/cli/inspect-badavi-payment-cases.ts
 */
import "../load-env.js";
import { withoutTenant } from "@fleethub/db";
import {
  derivePaymentEditMode,
  tripNeedsManualPaymentReview,
  resolveTripPaymentDisplayAmounts,
} from "@fleethub/auth/trip-payment-amounts";

const SLUG = "cosculluela";

async function findDriver(namePart: string) {
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findFirst({ where: { slug: SLUG }, select: { id: true, slug: true } }),
  );
  if (!tenant) throw new Error(`tenant ${SLUG} not found`);

  const driver = await withoutTenant((tx) =>
    tx.driver.findFirst({
      where: {
        tenantId: tenant.id,
        fullName: { contains: namePart, mode: "insensitive" },
      },
      select: { id: true, fullName: true },
    }),
  );
  return { tenant, driver };
}

function printTrip(t: {
  id: string;
  platform: string;
  externalTripId: string;
  startedAt: Date;
  grossAmountCents: bigint | null;
  netAmountCents: bigint | null;
  tipCents: bigint | null;
  paymentMethod: string | null;
  paymentValidated: boolean;
  cashPaymentCents: bigint | null;
  cardPaymentCents: bigint | null;
  appPaymentCents: bigint | null;
  fareType: string | null;
  ingestSource: string | null;
  liquidationStatus: string;
}) {
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
  console.log(
    t.startedAt.toISOString(),
    t.platform,
    t.fareType,
    t.liquidationStatus,
    "gross",
    Number(t.grossAmountCents ?? 0) / 100,
  );
  console.log(
    "net",
    Number(t.netAmountCents ?? 0) / 100,
    "tip",
    Number(t.tipCents ?? 0) / 100,
    "method",
    t.paymentMethod,
    "validated",
    t.paymentValidated,
    "mode",
    mode,
  );
  console.log(
    "display app/cash/card",
    Number(split.app) / 100,
    Number(split.cash) / 100,
    Number(split.card) / 100,
  );
  console.log("needsManualReview", tripNeedsManualPaymentReview(input));
  console.log("ingest", t.ingestSource, "ext", t.externalTripId.slice(0, 16));
}

async function inspectDriver(
  label: string,
  namePart: string,
  platform: "UBER" | "FREENOW" | undefined,
  grossCents: bigint,
  from: string,
  to: string,
) {
  const { tenant, driver } = await findDriver(namePart);
  if (!driver) {
    console.log(`\n=== ${label}: driver "${namePart}" NOT FOUND ===`);
    return;
  }
  const accounts = await withoutTenant((tx) =>
    tx.driverPlatformAccount.findMany({
      where: { tenantId: tenant.id, driverId: driver.id },
      select: { platform: true, externalDriverId: true, isActive: true },
    }),
  );
  console.log(`\n=== ${label}: ${driver.fullName} ===`);
  console.log("platform accounts", accounts);

  const trips = await withoutTenant((tx) =>
    tx.trip.findMany({
      where: {
        tenantId: tenant.id,
        driverId: driver.id,
        ...(platform ? { platform } : {}),
        grossAmountCents: grossCents,
        startedAt: { gte: new Date(from), lte: new Date(to) },
      },
      orderBy: { startedAt: "asc" },
      select: {
        id: true,
        platform: true,
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
  console.log("matches", trips.length);
  for (const t of trips) printTrip(t);

  const unvalidated = await withoutTenant((tx) =>
    tx.trip.count({
      where: {
        tenantId: tenant.id,
        driverId: driver.id,
        paymentValidated: false,
        ...(platform ? { platform } : {}),
      },
    }),
  );
  console.log("unvalidated trips (driver)", unvalidated);
}

async function main() {
  // Josep Garcia — FreeNow 29/06 ~00:48, 17.60 € T3 (screenshot: 29/06 00:48)
  await inspectDriver(
    "Josep Garcia 17.60€",
    "JOSEP",
    "FREENOW",
    1760n,
    "2026-06-28T22:00:00Z",
    "2026-06-29T04:00:00Z",
  );

  // Kelvin — Uber 26/06 12:15, 25 € + 2 € tip T3
  await inspectDriver(
    "Kelvin 25€ Uber",
    "KELVIN",
    "UBER",
    2500n,
    "2026-06-26T10:00:00Z",
    "2026-06-26T14:00:00Z",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
