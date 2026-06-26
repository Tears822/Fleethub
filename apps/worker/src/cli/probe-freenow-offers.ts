/**
 * Probe FreeNow API responses for missed/rejected offer metrics.
 * Usage: npm run probe:freenow-offers -w @fleethub/worker
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { listFreenowCompanyBookings } from "../lib/freenow-bookings.js";
import {
  freenowPublicDriverId,
  getFreenowCompanyEarnings,
  getFreenowDriverEarnings,
  listFreenowCompanyDrivers,
  listFreenowLinkedCompanies,
} from "../lib/freenow-client.js";
import { freenowEnvReady } from "../lib/freenow-env.js";
import { freenowSdkCall } from "../lib/freenow-sdk.js";
import { resolveFreenowNumericCompanyId } from "../lib/freenow-company-id.js";

config({ path: resolve(process.cwd(), "../../.env") });
config({ path: resolve(process.cwd(), ".env"), override: true });

const OFFER_HINT = /miss|reject|offer|cancel|unattend|declin|refus|lost|skip/i;

function walkKeys(
  obj: unknown,
  path = "",
  hits: Array<{ path: string; value: unknown }> = [],
): Array<{ path: string; value: unknown }> {
  if (obj == null) return hits;
  if (typeof obj !== "object") return hits;
  if (Array.isArray(obj)) {
    for (let i = 0; i < Math.min(obj.length, 3); i++) {
      walkKeys(obj[i], `${path}[${i}]`, hits);
    }
    return hits;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const p = path ? `${path}.${k}` : k;
    if (OFFER_HINT.test(k)) hits.push({ path: p, value: v });
    if (typeof v === "object" && v != null) walkKeys(v, p, hits);
  }
  return hits;
}

function countStates(bookings: { state?: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const b of bookings) {
    const s = b.state ?? "(none)";
    counts[s] = (counts[s] ?? 0) + 1;
  }
  return counts;
}

const ready = freenowEnvReady();
if (!ready.ok) {
  console.error("Missing:", ready.missing.join(", "));
  process.exit(1);
}

const days = Math.max(1, Number(process.argv[2] ?? "7") || 7);
const to = new Date();
const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

console.log("=== FreeNow offer/reject probe ===");
console.log("window:", from.toISOString(), "→", to.toISOString());

const linked = await listFreenowLinkedCompanies({ page: 0, size: 50 });
if (!linked.ok) {
  console.error("linked companies:", linked.message);
  process.exit(1);
}
console.log("linked companies:", linked.companies.length);

let allBookings: Awaited<ReturnType<typeof listFreenowCompanyBookings>>["bookings"] = [];
const stateTotals: Record<string, number> = {};
const bookingKeyHits = new Map<string, number>();

for (const company of linked.companies.slice(0, 8)) {
  const publicCompanyId = company.id?.trim();
  if (!publicCompanyId) continue;

  const batch = await listFreenowCompanyBookings({ publicCompanyId, from, to });
  if (!batch.ok) {
    console.log(`[bookings] ${publicCompanyId}: FAIL ${batch.message.slice(0, 120)}`);
    continue;
  }

  const states = countStates(batch.bookings);
  console.log(
    `[bookings] ${publicCompanyId} (${company.companyName ?? ""}): ${batch.bookings.length} rows | states: ${JSON.stringify(states)}`,
  );
  allBookings.push(...batch.bookings);
  for (const [s, n] of Object.entries(states)) {
    stateTotals[s] = (stateTotals[s] ?? 0) + n;
  }

  for (const b of batch.bookings.slice(0, 2)) {
    for (const h of walkKeys(b)) {
      bookingKeyHits.set(h.path, (bookingKeyHits.get(h.path) ?? 0) + 1);
    }
  }

  const companyEarnings = await getFreenowCompanyEarnings({
    publicCompanyId,
    from,
    to,
  });
  if (companyEarnings.ok) {
    const hits = walkKeys(companyEarnings.data);
    if (hits.length > 0) {
      console.log(`[company earnings] ${publicCompanyId} hint keys:`, hits);
    }
  }

  const drivers = await listFreenowCompanyDrivers(publicCompanyId, { page: 0, size: 3, status: "ACTIVE" });
  if (!drivers.ok || drivers.page.drivers.length === 0) continue;

  const driver = drivers.page.drivers[0]!;
  const publicDriverId = freenowPublicDriverId(driver) ?? "";
  if (!publicDriverId) continue;

  const driverEarnings = await getFreenowDriverEarnings({
    publicCompanyId,
    publicDriverId,
    from,
    to,
  });
  if (driverEarnings.ok) {
    const hits = walkKeys(driverEarnings.data);
    console.log(
      `[driver earnings] ${publicDriverId} (${driver.name}): tours=${driverEarnings.data.grossValues?.tours?.numberOfTours}`,
    );
    if (hits.length > 0) {
      console.log("  hint keys:", hits);
    }
  }

  const driverMetaHits = walkKeys(driver.metadata);
  if (driverMetaHits.length > 0) {
    console.log(`[driver metadata] ${publicDriverId}:`, driverMetaHits);
  }
}

console.log("\n--- Booking state totals (all companies) ---");
console.log(JSON.stringify(stateTotals, null, 2));
console.log("total booking rows:", allBookings.length);

if (bookingKeyHits.size > 0) {
  console.log("\n--- Booking object keys matching offer/reject hints ---");
  console.log(Object.fromEntries(bookingKeyHits));
} else {
  console.log("\n(no booking fields matched offer/reject hint regex in samples)");
}

// Try optional query params not in OpenAPI (state filter experiments)
const probeCompany = linked.companies[0]?.id?.trim();
if (probeCompany) {
  console.log("\n--- Experimental getCompanyBookings query params ---");
  const companyId = resolveFreenowNumericCompanyId(probeCompany);
  const experiments: Record<string, string>[] = [
    { state: "OFFER" },
    { states: "OFFER,CANCELED" },
    { bookingState: "OFFER" },
    { status: "OFFER" },
    { includeCanceled: "true" },
    { includeOffers: "true" },
    { includeAllStates: "true" },
  ];

  for (const extra of experiments) {
    const result = await freenowSdkCall("getCompanyBookings", (sdk) =>
      sdk.getCompanyBookings({
        publicCompanyId: probeCompany,
        from: from.toISOString(),
        to: to.toISOString(),
        page: 0,
        size: 20,
        ...(companyId != null ? { companyId } : {}),
        ...extra,
      } as Parameters<typeof sdk.getCompanyBookings>[0]),
    );
    if (!result.ok) {
      console.log(`  ${JSON.stringify(extra)} → ERROR: ${result.message.slice(0, 100)}`);
      continue;
    }
    const states = countStates(result.data.content ?? []);
    console.log(`  ${JSON.stringify(extra)} → ${(result.data.content ?? []).length} rows, states: ${JSON.stringify(states)}`);
  }
}

console.log("\nDone.");
