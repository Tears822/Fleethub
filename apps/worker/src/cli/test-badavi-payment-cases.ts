/**
 * Live test BADAVI payment cases (Kelvin Uber + Josep FreeNow).
 * Usage: npx tsx src/cli/run-with-worker-uber-env.ts src/cli/test-badavi-payment-cases.ts
 */
import "../load-env.js";
import { syncUberTripsViaReports } from "../lib/uber-reports.js";
import { freenowBookingToUpsert } from "../lib/freenow-booking-mapper.js";
import { listFreenowCompanyBookings } from "../lib/freenow-bookings.js";
import {
  tripNeedsManualPaymentReview,
  derivePaymentEditMode,
} from "@fleethub/auth/trip-payment-amounts";

const TENANT_ID = "442462fa-ee23-4009-bb5f-919032762333";
const KELVIN_UUID = "c4b25553-43f1-40e7-8e41-5d3c69df62bc";
const JOSEP_FN_ID = "9142OQ";
const FREENOW_COMPANY = "GEYTMOBQGE";

async function testKelvin() {
  const from = new Date("2026-06-26T00:00:00+02:00");
  const to = new Date("2026-06-27T00:00:00+02:00");

  const res = await syncUberTripsViaReports({
    tenantId: TENANT_ID,
    driverId: KELVIN_UUID,
    from,
    to,
  });
  if (!res.ok) {
    console.error("Kelvin Uber sync FAIL:", res.message);
    return;
  }

  console.log("=== Kelvin Uber 26/06 ===");
  console.log("trips:", res.data.length);

  const t25 = res.data.filter((t) => t.grossAmountCents === 2500n);
  console.log("25.00 € trips:", t25.length);

  for (const t of t25) {
    const review = tripNeedsManualPaymentReview({ ...t, paymentValidated: false });
    const mode = derivePaymentEditMode(t);
    console.log("---", t.startedAt, t.fareType);
    console.log("  method:", t.paymentMethod, "mode:", mode, "tip:", Number(t.tipCents ?? 0) / 100);
    console.log("  gross/net:", Number(t.grossAmountCents ?? 0) / 100, Number(t.netAmountCents ?? 0) / 100);
    console.log("  needsManualReview:", review);
  }

  const misclassified = res.data.filter(
    (t) =>
      t.paymentMethod === "cash" &&
      t.cashPaymentCents != null &&
      t.netAmountCents != null &&
      t.cashPaymentCents === t.netAmountCents &&
      t.grossAmountCents != null &&
      t.grossAmountCents !== t.netAmountCents,
  );
  console.log("likely uber-bug cash (cash=net, gross≠net):", misclassified.length);
}

async function testJosep() {
  const from = new Date("2026-06-28T00:00:00+02:00");
  const to = new Date("2026-06-30T00:00:00+02:00");

  const bookings = await listFreenowCompanyBookings({
    publicCompanyId: FREENOW_COMPANY,
    from,
    to,
  });
  if (!bookings.ok) {
    console.error("Josep FreeNow FAIL:", bookings.message);
    return;
  }

  const josepAll = bookings.bookings.filter(
    (b) => b.driver?.id?.trim() === JOSEP_FN_ID && b.state === "ACCOMPLISHED",
  );

  console.log("\n=== Josep FreeNow 28–29/06 (all) ===");
  console.log("accomplished:", josepAll.length);

  for (const b of josepAll.sort((a, z) =>
    String(a.pickupDate ?? "").localeCompare(String(z.pickupDate ?? "")),
  )) {
    const upsert = freenowBookingToUpsert(b);
    if (!upsert) continue;
    const amt = b.tourValue?.amount;
    const review = tripNeedsManualPaymentReview({ ...upsert, paymentValidated: upsert.paymentValidated ?? false });
    console.log("---", b.pickupDate, "€", amt, b.paymentMethod, upsert.fareType);
    console.log("  mapped:", upsert.paymentMethod, "validated:", upsert.paymentValidated, "review:", review);
  }

  const josep = josepAll.filter(
    (b) => b.tourValue?.amount != null && Math.round(b.tourValue.amount * 100) === 1760,
  );

  console.log("\n=== Josep 17.60 € exact ===");
  console.log("matches:", josep.length);

  for (const b of josep) {
    const upsert = freenowBookingToUpsert(b);
    if (!upsert) continue;
    const review = tripNeedsManualPaymentReview({ ...upsert, paymentValidated: upsert.paymentValidated ?? false });
    const mode = derivePaymentEditMode(upsert);
    console.log("---", b.pickupDate, upsert.fareType);
    console.log("  FN paymentMethod raw:", b.paymentMethod);
    console.log("  mapped:", upsert.paymentMethod, "validated:", upsert.paymentValidated, "mode:", mode);
    console.log("  gross/net:", Number(upsert.grossAmountCents ?? 0) / 100, Number(upsert.netAmountCents ?? 0) / 100);
    console.log("  needsManualReview:", review);
  }

  const any1760 = bookings.bookings.filter(
    (b) =>
      b.state === "ACCOMPLISHED" &&
      b.tourValue?.amount != null &&
      Math.round(b.tourValue.amount * 100) === 1760 &&
      b.pickupDate &&
      new Date(b.pickupDate) >= from &&
      new Date(b.pickupDate) < to,
  );
  console.log("\n=== Any FN 17.60 € in window ===", any1760.length);
  for (const b of any1760) {
    console.log(
      b.pickupDate,
      b.driver?.id,
      b.paymentMethod,
      b.hailingType,
      b.subFleetTypeLabel,
    );
  }
}

async function main() {
  await testKelvin();
  await testJosep();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
