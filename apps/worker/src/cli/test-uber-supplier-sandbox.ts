/**
 * Probe Supplier Platform sandbox vs what FleetHub sync uses.
 * Usage: UBER_SANDBOX=true npm run test:uber-supplier -w @fleethub/worker
 */
import path from "node:path";
import { config } from "dotenv";
import { getUberFleetAccessToken, listUberOrganizations, resolveUberOrgId } from "../lib/uber-fleet-client.js";
import { uberFleetEnv } from "../lib/uber-fleet-env.js";
import { isUberSandboxEnabled, resolveUberApiBaseUrl } from "../lib/uber-sandbox.js";

config({ path: path.resolve(process.cwd(), "../../.env") });
config({ path: path.resolve(process.cwd(), ".env"), override: true });

const env = uberFleetEnv();
const apiBase = resolveUberApiBaseUrl();

console.log("Supplier Platform sandbox probe");
console.log("  UBER_SANDBOX:", isUberSandboxEnabled());
console.log("  API base:", apiBase);

const tokenRes = await getUberFleetAccessToken();
if (!tokenRes.ok) {
  console.error("Token:", tokenRes.message);
  process.exit(1);
}
const accessToken = tokenRes.data;
console.log("  Token: OK");

const org = await resolveUberOrgId();
if (!org.ok) {
  console.error("Org:", org.message);
  process.exit(1);
}
console.log("  org_id:", org.data.slice(0, 24) + "…");

async function probe(label: string, url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  const preview = text.slice(0, 280).replace(/\s+/g, " ");
  console.log(`\n[${label}] ${res.status}`);
  console.log(preview + (text.length > 280 ? "…" : ""));
  return res.ok;
}

const base = apiBase.replace(/\/$/, "");

await probe(
  "Fleet sync: GET orgs",
  `${base}/v1/vehicle-suppliers/orgs`,
);

await probe(
  "Fleet sync: GET drivers",
  `${base}/v1/vehicle-suppliers/drivers?org_id=${encodeURIComponent(org.data)}&page_size=5`,
);

await probe(
  "Sandbox sample: analytics-data/query",
  `${base}/v1/vehicle-suppliers/analytics-data/query`,
  {
    method: "POST",
    body: JSON.stringify({
      reportRequests: [
        {
          timeRanges: [{ startsAt: Date.now() - 7 * 86400000, endsAt: Date.now() }],
          dimensions: [{ name: "vs:driver" }],
          metrics: [{ expression: "vs:TotalTrips" }],
        },
      ],
    }),
  },
);

await probe(
  "Sandbox vehicles: GET /v1/vehicle-suppliers/vehicles (no fields=_all_)",
  `${base}/v1/vehicle-suppliers/vehicles?org_id=${encodeURIComponent(org.data)}&page_size=5`,
);

const orgs = await listUberOrganizations();
console.log("\nOrganizations:", orgs.ok ? orgs.data.length : orgs.message);

console.log(`
Notes (per Uber Sandbox Experience doc):
- UBER_SANDBOX=true routes fleet HTTP to sandbox-api.uber.com (already wired).
- Driver/org APIs may behave like PRODUCTION (no test trip CSV).
- Vehicle assign/create + analytics query return SANDBOX test data.
- Trip Activity REPORTS are not listed as sandbox-supported — do not expect sample trips there.
- Production fleet data (Guillermo): keep UBER_SANDBOX=false.
`);
