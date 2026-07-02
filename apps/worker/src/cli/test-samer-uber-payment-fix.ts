/**
 * Live test: Samer Kabbani Uber payments classify as app (not cash/card alert).
 * Usage: npx tsx src/cli/run-with-worker-uber-env.ts src/cli/test-samer-uber-payment-fix.ts
 */
import "../load-env.js";
import { syncUberTripsViaReports } from "../lib/uber-reports.js";
import { tripNeedsManualPaymentReview } from "@fleethub/auth/trip-payment-amounts";

const TENANT_ID = "442462fa-ee23-4009-bb5f-919032762333"; // cosculluela / BADAVI
const SAMER_DRIVER_UUID = "538b60a6-d4d1-4df7-9c20-6dacd9bb6956";

async function main() {
  const to = new Date();
  const from = new Date(to.getTime() - 7 * 86400000);

  const res = await syncUberTripsViaReports({
    tenantId: TENANT_ID,
    driverId: SAMER_DRIVER_UUID,
    from,
    to,
  });
  if (!res.ok) {
    console.error("SYNC FAIL:", res.message);
    process.exit(1);
  }

  const trips = res.data;
  console.log("=== Samer Uber payment fix test ===");
  console.log("Trips synced:", trips.length);

  const t1970 = trips.filter((t) => t.grossAmountCents === 1970n);
  console.log("Trips gross 19.70 €:", t1970.length);

  for (const t of t1970) {
    const needsReview = tripNeedsManualPaymentReview({ ...t, paymentValidated: false });
    console.log("---", t.startedAt, t.fareType);
    console.log("  method:", t.paymentMethod, "| validated:", t.paymentValidated);
    console.log("  net:", Number(t.netAmountCents ?? 0) / 100, "tip:", Number(t.tipCents ?? 0) / 100);
    console.log(
      "  app/cash/card:",
      t.appPaymentCents != null ? Number(t.appPaymentCents) / 100 : null,
      t.cashPaymentCents != null ? Number(t.cashPaymentCents) / 100 : null,
      t.cardPaymentCents != null ? Number(t.cardPaymentCents) / 100 : null,
    );
    console.log("  needsManualReview (if unvalidated):", needsReview);
  }

  const misclassified = trips.filter(
    (t) =>
      t.paymentMethod === "cash" &&
      t.cashPaymentCents != null &&
      t.netAmountCents != null &&
      t.cashPaymentCents === t.netAmountCents &&
      t.grossAmountCents != null &&
      t.grossAmountCents !== t.netAmountCents,
  );

  console.log("\nSummary:");
  console.log("  app trips:", trips.filter((t) => t.paymentMethod === "app").length);
  console.log("  cash trips:", trips.filter((t) => t.paymentMethod === "cash").length);
  console.log("  likely old-bug cash (cash=net, gross≠net):", misclassified.length);

  const fail1970 = t1970.some(
    (t) => t.paymentMethod !== "app" || tripNeedsManualPaymentReview({ ...t, paymentValidated: false }),
  );
  if (fail1970) {
    console.error("\nFAIL: 19.70 € trip still misclassified");
    process.exit(1);
  }
  if (t1970.length === 0) {
    console.warn("\nWARN: no 19.70 € trip in window — check dates or Uber report");
  } else {
    console.log("\nPASS: 19.70 € trip(s) import as app, no manual payment alert");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
