/**
 * Smoke-test FreeNow earnings via SDK (`getCompanyEarnings` / `getDriverEarnings`).
 *
 * Usage:
 *   npm run test:freenow-earnings -w @fleethub/worker
 *   npm run test:freenow-earnings -w @fleethub/worker -- --company GEYTMOBQGE 7
 *   npm run test:freenow-earnings -w @fleethub/worker -- GEYTMOBQGE <publicDriverId> 7
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import {
  freenowDriverDisplayName,
  freenowDriverEarningsQueryIds,
  freenowEarningsNumberOfTours,
  freenowLinkedCompanyName,
  freenowPublicDriverId,
  getFreenowAccessToken,
  getFreenowCompanyEarnings,
  getFreenowDriverEarnings,
  listFreenowCompanyDrivers,
  listFreenowLinkedCompanies,
  resolveFreenowNumericCompanyId,
} from "../lib/freenow-client.js";
import { isLikelyPlaceholderFreenowNumericId } from "../lib/freenow-id-hints.js";
import { freenowEnvReady } from "../lib/freenow-env.js";

config({ path: resolve(process.cwd(), "../../.env") });
config({ path: resolve(process.cwd(), ".env"), override: true });

const ready = freenowEnvReady();
if (!ready.ok) {
  console.error("Missing:", ready.missing.join(", "));
  process.exit(1);
}

const argv = process.argv.slice(2);
const companyFlagIdx = argv.findIndex((a) => a === "--company" || a === "-c");
const companyMode = companyFlagIdx >= 0;
if (companyMode) {
  argv.splice(companyFlagIdx, 1);
}

const companyArg = argv[0]?.trim();
let driverArg: string | undefined;
let daysRaw: string | undefined;
if (companyMode) {
  daysRaw = argv[1];
} else if (argv.length >= 3) {
  driverArg = argv[1]?.trim();
  daysRaw = argv[2];
} else if (argv.length === 2 && /^\d+$/.test(argv[1] ?? "")) {
  daysRaw = argv[1];
} else if (argv.length === 2) {
  driverArg = argv[1]?.trim();
}
const days = Math.max(1, Number(daysRaw ?? "7") || 7);

const token = await getFreenowAccessToken(true);
if (!token.ok) {
  console.error("Token failed:", token.message);
  process.exit(1);
}
console.log("Token OK | scope:", token.meta.scope ?? "(none)");

let publicCompanyId = companyArg;
if (!publicCompanyId) {
  const linked = await listFreenowLinkedCompanies({ page: 0, size: 25 });
  if (!linked.ok) {
    console.error("linked-companies:", linked.message);
    process.exit(1);
  }
  const badavi = linked.companies.find((c) =>
    freenowLinkedCompanyName(c).toUpperCase().includes("BADAVI"),
  );
  publicCompanyId = badavi?.id ?? linked.companies[0]?.id;
}
if (!publicCompanyId) {
  console.error("No publicCompanyId; pass as first arg (e.g. GEYTMOBQGE).");
  process.exit(1);
}
console.log("publicCompanyId:", publicCompanyId);

const to = new Date();
const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
console.log("Range: from=%s to=%s (%d days)", from.toISOString(), to.toISOString(), days);

function warnPlaceholderIds(ids: { companyId?: number; driverId?: number }) {
  if (ids.companyId != null && isLikelyPlaceholderFreenowNumericId(ids.companyId)) {
    console.warn(
      "Warning: companyId=%d looks like a doc example (12345/987654), not a real FreeNow int64 — replace FREENOW_COMPANY_ID_MAP.",
      ids.companyId,
    );
  }
  if (ids.driverId != null && isLikelyPlaceholderFreenowNumericId(ids.driverId)) {
    console.warn(
      "Warning: driverId=%d looks like a doc example (12345678), not a real FreeNow int64 — replace FREENOW_DRIVER_ID_MAP.",
      ids.driverId,
    );
  }
}

if (companyMode) {
  console.log("Mode: company earnings (getCompanyEarnings)");
  const companyId = resolveFreenowNumericCompanyId(publicCompanyId);
  console.log(
    "Query: from, to, legacy companyId=%s (optional)",
    companyId != null ? String(companyId) : "(omitted — public id in path)",
  );
  warnPlaceholderIds({ companyId });
  const earnings = await getFreenowCompanyEarnings({ publicCompanyId, from, to });
  if (!earnings.ok) {
    console.error("getCompanyEarnings failed:", earnings.message);
    process.exit(1);
  }
  console.log("getCompanyEarnings OK (HTTP %d)", earnings.status);
  console.log(
    "numberOfTours (gross): %d | currency: %s",
    freenowEarningsNumberOfTours(earnings.data),
    earnings.data.metadata?.currency ?? "(none)",
  );
  const preview = JSON.stringify(earnings.data, null, 2);
  console.log(preview.slice(0, 4000) + (preview.length > 4000 ? "\n…" : ""));
  process.exit(0);
}

let publicDriverId = driverArg;
if (!publicDriverId) {
  const drivers = await listFreenowCompanyDrivers(publicCompanyId, {
    page: 0,
    size: 10,
    status: "ACTIVE",
  });
  if (!drivers.ok) {
    console.error("GET …/drivers failed:", drivers.message);
    process.exit(1);
  }
  console.log(
    "Drivers (page %d/%d, total %d):",
    drivers.page.page + 1,
    drivers.page.totalPages,
    drivers.page.totalElements,
  );
  for (const d of drivers.page.drivers.slice(0, 5)) {
    console.log(" -", freenowPublicDriverId(d), freenowDriverDisplayName(d));
  }
  publicDriverId = freenowPublicDriverId(drivers.page.drivers[0] ?? {});
}
if (!publicDriverId) {
  console.error("No publicDriverId; pass as second arg or use --company for company earnings.");
  process.exit(1);
}
console.log("Mode: driver earnings (getDriverEarnings)");
console.log("publicDriverId:", publicDriverId);

const queryIds = freenowDriverEarningsQueryIds(publicCompanyId, publicDriverId);
console.log(
  "Legacy query ids (optional): companyId=%s driverId=%s",
  queryIds.companyId != null ? String(queryIds.companyId) : "(omitted)",
  queryIds.driverId != null ? String(queryIds.driverId) : "(omitted)",
);
warnPlaceholderIds(queryIds);

const earnings = await getFreenowDriverEarnings({
  publicCompanyId,
  publicDriverId,
  from,
  to,
});
if (!earnings.ok) {
  console.error("getDriverEarnings failed:", earnings.message);
  process.exit(1);
}

console.log("getDriverEarnings OK (HTTP %d)", earnings.status);
const driverTours = freenowEarningsNumberOfTours(earnings.data);
console.log(
  "numberOfTours (gross): %d | currency: %s",
  driverTours,
  earnings.data.metadata?.currency ?? "(none)",
);

if (driverTours === 0) {
  const companyPeek = await getFreenowCompanyEarnings({ publicCompanyId, from, to });
  if (companyPeek.ok) {
    const companyTours = freenowEarningsNumberOfTours(companyPeek.data);
    if (companyTours > 0 && driverTours === 0) {
      console.warn(
        "Company has %d tours in this window but driver shows 0 — check publicDriverId or date range (bookings API).",
        companyTours,
      );
      if (
        queryIds.driverId != null &&
        isLikelyPlaceholderFreenowNumericId(queryIds.driverId)
      ) {
        console.warn(
          "Remove FREENOW_DRIVER_ID_MAP placeholder ids — live API uses public ids only.",
        );
      }
      console.warn("Fleet totals: npm run test:freenow-earnings -w @fleethub/worker -- --company %s %d", publicCompanyId, days);
    }
  }
}

const preview = JSON.stringify(earnings.data, null, 2);
console.log(preview.slice(0, 4000) + (preview.length > 4000 ? "\n…" : ""));
