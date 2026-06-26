/** Uber Vehicle Suppliers API — env (fleet / umbrella account). */

import { isUberSandboxEnabled, resolveUberApiBaseUrl } from "./uber-sandbox.js";

export const UBER_FLEET_DEFAULT_SCOPES = [
  "solutions.suppliers.metrics.read",
  "solutions.suppliers.reports",
  "supplier.partner.payments",
  "vehicle_suppliers.organizations.read",
  "solutions.suppliers.drivers.status.read",
].join(" ");

function pick(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v : undefined;
}

export function uberFleetEnv() {
  const sandbox = isUberSandboxEnabled();
  return {
    sandbox,
    clientId: pick("UBER_CLIENT_ID"),
    clientSecret: pick("UBER_CLIENT_SECRET"),
    tokenUrl: pick("UBER_TOKEN_URL") ?? "https://login.uber.com/oauth/v2/token",
    apiBaseUrl: resolveUberApiBaseUrl(pick("UBER_API_BASE_URL")),
    scope: pick("UBER_OAUTH_SCOPE") ?? UBER_FLEET_DEFAULT_SCOPES,
    /** Encrypted org UUID from GET /v1/vehicle-suppliers/orgs (optional — else first org). */
    orgId: pick("UBER_ORG_ID"),
  };
}

export function uberFleetEnvReady(): { ok: true } | { ok: false; missing: string[] } {
  const env = uberFleetEnv();
  const missing: string[] = [];
  if (!env.clientId) missing.push("UBER_CLIENT_ID");
  if (!env.clientSecret) missing.push("UBER_CLIENT_SECRET");
  if (missing.length > 0) return { ok: false, missing };
  return { ok: true };
}
