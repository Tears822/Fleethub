/**
 * Smoke-test company drivers list (Meta-Account API).
 * Usage:
 *   npm run test:freenow-drivers -w @fleethub/worker
 *   npm run test:freenow-drivers -w @fleethub/worker -- GEYTMOBQGE
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import {
  freenowDriverDisplayName,
  freenowLinkedCompanyName,
  freenowPublicDriverId,
  getFreenowAccessToken,
  listAllFreenowCompanyDrivers,
  listFreenowLinkedCompanies,
} from "../lib/freenow-client.js";
import { freenowEnvReady } from "../lib/freenow-env.js";

config({ path: resolve(process.cwd(), "../../.env") });
config({ path: resolve(process.cwd(), ".env"), override: true });

const ready = freenowEnvReady();
if (!ready.ok) {
  console.error("Missing:", ready.missing.join(", "));
  process.exit(1);
}

const companyArg = process.argv[2]?.trim();
const status = (process.argv[3]?.trim().toUpperCase() || "ACTIVE") as "ACTIVE" | "PENDING" | "ABUSE";

const token = await getFreenowAccessToken(true);
if (!token.ok) {
  console.error("Token failed:", token.message);
  process.exit(1);
}

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
  console.error("No publicCompanyId; pass as arg (e.g. GEYTMOBQGE).");
  process.exit(1);
}

console.log("GET /v1/companies/%s/drivers (status=%s)", publicCompanyId, status);

const drivers = await listAllFreenowCompanyDrivers(publicCompanyId, { status });
if (!drivers.ok) {
  console.error("Failed:", drivers.message);
  process.exit(1);
}

console.log("Drivers:", drivers.drivers.length);
console.log(
  "Note: content[].id is the public driver id (linking + earnings path). Numeric driverId query params are deprecated.",
);
for (const d of drivers.drivers.slice(0, 15)) {
  console.log(" -", freenowPublicDriverId(d), freenowDriverDisplayName(d));
}
if (drivers.drivers.length > 15) {
  console.log(" … and %d more", drivers.drivers.length - 15);
}
