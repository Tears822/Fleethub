/**
 * Ensure FreeNow umbrella empresas exist and move drivers to the correct FleetHub company.
 *
 * Usage:
 *   npm run realign:freenow-companies -w @fleethub/worker -- cosculluela
 *   npm run realign:freenow-companies -w @fleethub/worker -- cosculluela --dry-run
 */
import path from "node:path";
import { config } from "dotenv";
import { prisma } from "@fleethub/db";
import { realignDriverCompaniesFromFreenow } from "../lib/freenow-realign-driver-companies.js";

config({ path: path.resolve(process.cwd(), "../../.env") });
config({ path: path.resolve(process.cwd(), ".env"), override: true });

async function main() {
  const tenantSlug = process.argv[2]?.trim();
  const dryRun = process.argv.includes("--dry-run");

  if (!tenantSlug) {
    console.error("Usage: realign-freenow-companies.ts <tenant-slug> [--dry-run]");
    process.exit(1);
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, slug: true },
  });
  if (!tenant) {
    console.error("Tenant not found:", tenantSlug);
    process.exit(1);
  }

  console.log("=== Realign drivers from FreeNow companies ===");
  console.log("Tenant:", tenant.slug);
  console.log("Dry run:", dryRun);

  const stats = await realignDriverCompaniesFromFreenow({
    tenantId: tenant.id,
    dryRun,
  });

  console.log("Stats:", stats);
  if (stats.unmatchedCompanies.length > 0) {
    console.log("Unmatched FN companies (no FleetHub empresa):");
    for (const line of stats.unmatchedCompanies) console.log(" -", line);
  }
  if (stats.errors.length > 0) {
    console.log("Errors:");
    for (const e of stats.errors) console.log(" -", e);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
