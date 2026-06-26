/**
 * Inspect FreeNow API payloads for commission / payment fields.
 *
 * Usage:
 *   npm run inspect:freenow-api -w @fleethub/worker
 *   npm run inspect:freenow-api -w @fleethub/worker -- GEYTMOBQGE 7
 *   npm run inspect:freenow-api -w @fleethub/worker -- GEYTMOBQGE 7 GYZDOMBRHEZDQ
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import {
  extractFreenowEarningsTotals,
  applyFreenowDriverEarningsToTrips,
} from "../lib/freenow-earnings-mapper.js";
import {
  freenowBookingToUpsert,
  freenowPlatformFeeFromTourValue,
} from "../lib/freenow-booking-mapper.js";
import { listFreenowCompanyBookings } from "../lib/freenow-bookings.js";
import {
  getFreenowAccessToken,
  getFreenowDriverEarnings,
  listFreenowCompanyDrivers,
  freenowPublicDriverId,
  freenowDriverDisplayName,
} from "../lib/freenow-client.js";
import { freenowEnvReady } from "../lib/freenow-env.js";
import { resolveFreenowNumericCompanyId } from "../lib/freenow-company-id.js";
import { resolveFreenowNumericDriverId } from "../lib/freenow-driver-id.js";

config({ path: resolve(process.cwd(), "../../.env") });
config({ path: resolve(process.cwd(), ".env"), override: true });

const ready = freenowEnvReady();
if (!ready.ok) {
  console.error("Missing:", ready.missing.join(", "));
  process.exit(1);
}

const publicCompanyId = process.argv[2]?.trim() || process.env.FREENOW_PUBLIC_COMPANY_ID?.trim() || "GEYTMOBQGE";
const days = Math.max(1, Number(process.argv[3] ?? "7") || 7);
const driverFilter = process.argv[4]?.trim();

const token = await getFreenowAccessToken(true);
if (!token.ok) {
  console.error("Token failed:", token.message);
  process.exit(1);
}

console.log("=== FreeNow API inspect ===");
console.log("publicCompanyId:", publicCompanyId);
console.log("numeric companyId:", resolveFreenowNumericCompanyId(publicCompanyId) ?? "(not mapped)");
console.log("window days:", days);
console.log("auth scope:", token.meta.scope ?? "(none)");

const to = new Date();
const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
console.log("from:", from.toISOString());
console.log("to:", to.toISOString());

const bookings = await listFreenowCompanyBookings({ publicCompanyId, from, to });
if (!bookings.ok) {
  console.error("getCompanyBookings FAILED:", bookings.message);
  process.exit(1);
}

const accomplished = bookings.bookings.filter((b) => b.state === "ACCOMPLISHED");
console.log("\n--- Bookings ---");
console.log("total rows:", bookings.bookings.length, "| ACCOMPLISHED:", accomplished.length);

let withTaxPct = 0;
let withFeeFromTax = 0;
const sampleBookings = accomplished
  .filter((b) => !driverFilter || b.driver?.id?.trim() === driverFilter)
  .slice(0, 8);

for (const b of sampleBookings) {
  const tv = b.tourValue;
  const grossCents = tv?.amount != null ? BigInt(Math.round(tv.amount * 100)) : 0n;
  const taxPct = tv?.taxPercentage;
  if (taxPct != null && taxPct > 0) withTaxPct += 1;
  const fee = freenowPlatformFeeFromTourValue(grossCents, taxPct);
  if (fee != null && fee > 0n) withFeeFromTax += 1;
  const mapped = freenowBookingToUpsert(b);
  console.log("\nbooking:", b.id);
  console.log("  driver:", b.driver?.name, "|", b.driver?.id);
  console.log("  pickup:", b.pickupDate);
  console.log("  paymentMethod:", b.paymentMethod);
  console.log("  hailingType:", b.hailingType, "| subFleet:", b.subFleetTypeLabel);
  console.log("  tourValue:", JSON.stringify(tv));
  console.log(
    "  mapper → gross:",
    mapped?.grossAmountCents?.toString(),
    "fee:",
    mapped?.platformFeeCents?.toString() ?? "null",
    "net:",
    mapped?.netAmountCents?.toString(),
    "fareType:",
    mapped?.fareType,
  );
}

console.log("\nbookings with taxPercentage > 0 (in sample):", withTaxPct, "/", sampleBookings.length);
console.log("bookings with derived fee (in sample):", withFeeFromTax, "/", sampleBookings.length);

console.log("\n--- Drivers (first page) ---");
const drivers = await listFreenowCompanyDrivers(publicCompanyId, { page: 0, size: 10, status: "ACTIVE" });
if (!drivers.ok) {
  console.error("getCompanyDrivers FAILED:", drivers.message);
} else {
  for (const d of drivers.page.drivers.slice(0, 5)) {
    const pub = freenowPublicDriverId(d);
    console.log(" -", pub, freenowDriverDisplayName(d), "| numericId:", resolveFreenowNumericDriverId(pub ?? "") ?? "(not mapped)");
  }
}

const targetDriver =
  driverFilter ??
  freenowPublicDriverId(drivers.ok ? (drivers.page.drivers[0] ?? {}) : {}) ??
  accomplished[0]?.driver?.id?.trim();

if (!targetDriver) {
  console.log("\nNo driver to test earnings.");
  process.exit(0);
}

console.log("\n--- Driver earnings ---");
console.log("publicDriverId:", targetDriver);
console.log("legacy numeric driverId:", resolveFreenowNumericDriverId(targetDriver) ?? "(not set — OK, API uses public id)");

const earnings = await getFreenowDriverEarnings({
  publicCompanyId,
  publicDriverId: targetDriver,
  from,
  to,
});
if (!earnings.ok) {
  console.error("getDriverEarnings FAILED:", earnings.message);
  process.exit(1);
}

const totals = extractFreenowEarningsTotals(earnings.data);
console.log("extracted totals:", {
  commissionCents: totals.commissionCents.toString(),
  incentivesCents: totals.incentivesCents.toString(),
  totalBeforeCommissionCents: totals.totalBeforeCommissionCents.toString(),
  numberOfTours: totals.numberOfTours,
});

const gv = earnings.data.grossValues;
console.log("grossValues commission fields:", {
  commission: gv?.commission,
  commissionCharged: gv?.commissionCharged,
  commissionRefunded: gv?.commissionRefunded,
  totalBeforeCommission: gv?.totalBeforeCommission,
  totalAfterCommission: gv?.totalAfterCommission,
  incentives: gv?.incentives,
  tours: gv?.tours?.numberOfTours,
});

const driverTrips = accomplished
  .filter((b) => b.driver?.id?.trim() === targetDriver)
  .map((b) => freenowBookingToUpsert(b))
  .filter((t): t is NonNullable<typeof t> => t != null);

if (driverTrips.length > 0) {
  const enriched = applyFreenowDriverEarningsToTrips(driverTrips, totals);
  console.log("\n--- After earnings enrich (first 3 trips) ---");
  for (const t of enriched.slice(0, 3)) {
    console.log(
      t.externalTripId,
      "gross",
      t.grossAmountCents?.toString(),
      "fee",
      t.platformFeeCents?.toString() ?? "null",
      "bonus",
      t.platformBonusCents?.toString(),
      "net",
      t.netAmountCents?.toString(),
    );
  }
}

console.log("\n(full earnings JSON truncated to 3000 chars)");
const raw = JSON.stringify(earnings.data, null, 2);
console.log(raw.slice(0, 3000) + (raw.length > 3000 ? "\n…" : ""));
