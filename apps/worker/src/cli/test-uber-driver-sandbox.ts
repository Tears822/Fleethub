/**
 * Driver API smoke test: /partners/me, /trips, /payments
 * Usage: npm run test:uber-driver -w @fleethub/worker
 */
import path from "node:path";
import { config } from "dotenv";
import { buildUberDriverAuthorizeUrl, uberDriverEnv } from "../lib/uber-driver-env.js";
import {
  getUberPartnerProfile,
  resolveUberDriverAccessToken,
  uberPartnerDisplayName,
} from "../lib/uber-driver-client.js";
import { syncUberTripsViaDriverApi } from "../lib/uber-driver-sync.js";

config({ path: path.resolve(process.cwd(), "../../.env") });
config({ path: path.resolve(process.cwd(), ".env"), override: true });

const env = uberDriverEnv();
const daysBack = Math.min(30, Math.max(1, Number.parseInt(process.argv[2] ?? "7", 10) || 7));

console.log("Uber Driver API test");
console.log("  mode:", env.sandbox ? "SANDBOX" : "PRODUCTION");
console.log("  base:", env.apiBaseUrl);
console.log("  range: last %d day(s)", daysBack);

const authorizeUrl = buildUberDriverAuthorizeUrl();
if (!env.accessToken && !env.authCode && !env.refreshToken) {
  console.log("\nNo driver token configured.");
  console.log("Fleet client_credentials cannot call GET /v1/partners/me.\n");
  if (authorizeUrl) {
    console.log("1. Open (as the driver):\n", authorizeUrl);
    console.log("\n2. Set UBER_DRIVER_AUTH_CODE=<code> and re-run.");
  } else {
    console.log("Set UBER_DRIVER_ACCESS_TOKEN or UBER_DRIVER_REDIRECT_URI + auth code.");
  }
  process.exit(1);
}

const token = await resolveUberDriverAccessToken();
if (!token.ok) {
  console.error("Token:", token.message);
  process.exit(1);
}

const profile = await getUberPartnerProfile(token.data);
if (!profile.ok) {
  console.error("GET /partners/me:", profile.message);
  process.exit(1);
}

console.log("\n--- GET /v1/partners/me ---");
console.log("driver_id:", profile.data.driver_id ?? "(missing)");
console.log("name:", uberPartnerDisplayName(profile.data) || "—");
console.log("email:", profile.data.email ?? "—");
console.log("activation_status:", profile.data.activation_status ?? "—");

const to = new Date();
const from = new Date(to.getTime() - daysBack * 24 * 60 * 60 * 1000);
const sync = await syncUberTripsViaDriverApi({ from, to, accessToken: token.data });

if (!sync.ok) {
  console.error("\nSync failed:", sync.message);
  process.exit(1);
}

console.log("\n--- trips + payments (merged) ---");
console.log("raw trips:", sync.tripsCount, "| raw payments:", sync.paymentsCount);
console.log("trip upserts:", sync.data.length);
for (const t of sync.data.slice(0, 5)) {
  console.log(
    " -",
    t.externalTripId.slice(0, 12) + "…",
    t.startedAt,
    t.netAmountCents?.toString() ?? "—",
  );
}

console.log("\nDriver API test OK.");
