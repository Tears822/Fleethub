/**
 * Smoke-test Uber client_credentials (Step 2 + orgs API).
 * Usage from monorepo root: npm run test:uber -w @fleethub/worker
 */
import "dotenv/config";
import { config } from "dotenv";
import { resolve } from "node:path";
import { fetchClientCredentialsToken } from "../lib/oauth-client-credentials.js";
import { isUberSandboxEnabled, resolveUberApiBaseUrl } from "../lib/uber-sandbox.js";

config({ path: resolve(process.cwd(), "../../.env") });
config({ path: resolve(process.cwd(), ".env") });

const scopes =
  process.env.UBER_OAUTH_SCOPE?.trim() ||
  [
    "solutions.suppliers.metrics.read",
    "solutions.suppliers.reports",
    "supplier.partner.payments",
    "vehicle_suppliers.organizations.read",
    "solutions.suppliers.drivers.status.read",
  ].join(" ");

const clientId = process.env.UBER_CLIENT_ID?.trim();
const clientSecret = process.env.UBER_CLIENT_SECRET?.trim();
const tokenUrl =
  process.env.UBER_TOKEN_URL?.trim() ?? "https://auth.uber.com/oauth/v2/token";
const apiBase = resolveUberApiBaseUrl(process.env.UBER_API_BASE_URL?.trim());

if (!clientId || !clientSecret) {
  console.error("Set UBER_CLIENT_ID and UBER_CLIENT_SECRET in fleethub/.env");
  process.exit(1);
}

const token = await fetchClientCredentialsToken({
  tokenUrl,
  clientId,
  clientSecret,
  scope: scopes,
});

if (!token.ok) {
  console.error("Token failed:", token.message);
  process.exit(1);
}

console.log("Token OK (length %d)", token.accessToken.length);
console.log("UBER_SANDBOX:", isUberSandboxEnabled(), "| API base:", apiBase);

const orgsRes = await fetch(`${apiBase.replace(/\/$/, "")}/v1/vehicle-suppliers/orgs`, {
  headers: {
    Authorization: `Bearer ${token.accessToken}`,
    "Content-Type": "application/json",
  },
});

const orgsText = await orgsRes.text();
if (!orgsRes.ok) {
  console.error("GET /v1/vehicle-suppliers/orgs failed:", orgsRes.status, orgsText.slice(0, 500));
  process.exit(1);
}

let orgsJson: { organizations?: { id: string; name?: string }[] };
try {
  orgsJson = JSON.parse(orgsText) as typeof orgsJson;
} catch {
  console.error("Orgs response not JSON");
  process.exit(1);
}

const orgs = orgsJson.organizations ?? [];
console.log("Organizations:", orgs.length);
for (const o of orgs.slice(0, 5)) {
  console.log(" -", o.id, o.name ?? "");
}
const orgId = process.env.UBER_ORG_ID?.trim() || orgs[0]?.id;
if (orgs[0] && !process.env.UBER_ORG_ID?.trim()) {
  console.log("\nTip: set UBER_ORG_ID=%s in .env", orgs[0].id);
}

if (orgId) {
  const driversRes = await fetch(
    `${apiBase.replace(/\/$/, "")}/v1/vehicle-suppliers/drivers?org_id=${encodeURIComponent(orgId)}&page_size=10`,
    {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "Content-Type": "application/json",
      },
    },
  );
  const driversText = await driversRes.text();
  if (!driversRes.ok) {
    console.error("GET drivers failed:", driversRes.status, driversText.slice(0, 500));
  } else {
    type DriversJson = {
      driverInformation?: { driverId?: string; firstName?: string; lastName?: string }[];
      drivers?: unknown[];
    };
    let driversJson: DriversJson;
    try {
      driversJson = JSON.parse(driversText) as DriversJson;
    } catch {
      console.error("Drivers response not JSON");
      process.exit(1);
    }
    const rows = driversJson.driverInformation ?? [];
    console.log("\nDrivers in org:", rows.length, "(driverInformation array)");
    for (const d of rows.slice(0, 10)) {
      const name = [d.firstName, d.lastName].filter(Boolean).join(" ");
      console.log(" -", name || "(no name)");
      if (d.driverId) console.log("     driverId:", d.driverId);
    }
    if (rows.length === 0 && driversJson.drivers?.length) {
      console.log("(legacy `drivers` key present — update worker client)");
    }
  }
}

console.log("\nUber fleet auth OK.");
