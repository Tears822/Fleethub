/**
 * Smoke-test FreeNow: Keycloak token + SDK getLinkedCompanies.
 * Usage: npm run test:freenow -w @fleethub/worker
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import {
  freenowLinkedCompanyName,
  getFreenowAccessToken,
  listFreenowLinkedCompanies,
} from "../lib/freenow-client.js";
import { freenowEnv, freenowEnvReady } from "../lib/freenow-env.js";

config({ path: resolve(process.cwd(), "../../.env") });
config({ path: resolve(process.cwd(), ".env"), override: true });

const ready = freenowEnvReady();
if (!ready.ok) {
  console.error("Missing:", ready.missing.join(", "));
  process.exit(1);
}

const env = freenowEnv();
console.log("Auth mode:", env.authMode, "| prelive:", env.prelive);
console.log("Token URL:", env.tokenUrl);
console.log("API base:", env.apiBaseUrl);

const token = await getFreenowAccessToken(true);
if (!token.ok) {
  console.error("Token failed:", token.message);
  process.exit(1);
}

console.log("Token OK (length %d)", token.meta.accessToken.length);
if (token.meta.expiresIn != null) {
  console.log("expires_in:", token.meta.expiresIn);
}
if (token.meta.scope) {
  console.log("scope:", token.meta.scope);
}

const linked = await listFreenowLinkedCompanies({ page: 0, size: 25 });
if (!linked.ok) {
  console.error("getLinkedCompanies failed:", linked.message);
  process.exit(1);
}

console.log("getLinkedCompanies OK (HTTP %d)", linked.status);
console.log("Linked companies:", linked.companies.length);
for (const c of linked.companies.slice(0, 10)) {
  console.log(" -", c.id, freenowLinkedCompanyName(c));
}
