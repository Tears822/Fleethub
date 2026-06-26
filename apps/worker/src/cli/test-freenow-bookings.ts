/**
 * Smoke-test getCompanyBookings via @api/freenow SDK.
 * Usage:
 *   npm run test:freenow-bookings -w @fleethub/worker
 *   npm run test:freenow-bookings -w @fleethub/worker -- GEYTMOBQGE 7
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { listFreenowCompanyBookings } from "../lib/freenow-bookings.js";
import { resolveFreenowNumericCompanyId } from "../lib/freenow-company-id.js";
import { freenowBookingToUpsert } from "../lib/freenow-booking-mapper.js";
import { getFreenowAccessToken } from "../lib/freenow-client.js";
import { freenowEnvReady } from "../lib/freenow-env.js";

config({ path: resolve(process.cwd(), "../../.env") });
config({ path: resolve(process.cwd(), ".env"), override: true });

if (!freenowEnvReady().ok) {
  console.error("Missing FreeNow credentials in .env");
  process.exit(1);
}

const publicCompanyId = process.argv[2]?.trim() || "GEYTMOBQGE";
const days = Math.max(1, Number(process.argv[3] ?? "7") || 7);
const companyIdArg = process.argv[4]?.trim();
if (companyIdArg) {
  process.env.FREENOW_COMPANY_ID = companyIdArg;
  process.env.FREENOW_PUBLIC_COMPANY_ID = publicCompanyId;
}
const numericId = resolveFreenowNumericCompanyId(publicCompanyId);

const token = await getFreenowAccessToken(true);
if (!token.ok) {
  console.error("Token failed:", token.message);
  process.exit(1);
}
console.log(
  "Token OK | companyId (numeric): %s",
  numericId != null ? String(numericId) : "(omitted — live API usually resolves from publicCompanyId)",
);

const to = new Date();
const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

const bookings = await listFreenowCompanyBookings({ publicCompanyId, from, to });
if (!bookings.ok) {
  console.error("getCompanyBookings failed:", bookings.message);
  console.error(
    "Tip: optional FREENOW_COMPANY_ID_MAP if your environment requires it; pass numeric id as 4th arg to test.",
  );
  process.exit(1);
}

console.log("Bookings fetched:", bookings.bookings.length);
const accomplished = bookings.bookings.filter((b) => b.state === "ACCOMPLISHED");
console.log("ACCOMPLISHED:", accomplished.length);

for (const b of accomplished.slice(0, 5)) {
  const trip = freenowBookingToUpsert(b);
  console.log(
    " -",
    b.id,
    b.driver?.name ?? "?",
    b.pickupDate?.slice(0, 10),
    trip ? `gross ${trip.grossAmountCents}c` : "skip",
  );
}
