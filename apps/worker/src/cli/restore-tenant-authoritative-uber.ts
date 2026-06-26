/**
 * Reactivate Uber platform links for drivers in a tenant's authoritative companies.
 * Used after clone purge removed spreadsheet-linked Trade Taxi (etc.) drivers.
 *
 * Usage:
 *   npm run restore:tenant-uber -w @fleethub/worker -- trade-taxi-sl
 *   npm run restore:tenant-uber -w @fleethub/worker -- trade-taxi-sl --dry-run
 */
import path from "node:path";
import { config } from "dotenv";
import {
  companiesForTenantSlug,
  GROUP_TENANT_COMPANY_BY_TAX_ID,
  normalizeTaxId,
} from "@fleethub/auth/group-tenant-company-map";
import { prisma, RidePlatform } from "@fleethub/db";

config({ path: path.resolve(process.cwd(), "../../.env") });

function authoritativeTaxIdsForSlug(slug: string): string[] {
  return Object.entries(GROUP_TENANT_COMPANY_BY_TAX_ID)
    .filter(([, spec]) => spec.tenantSlug === slug)
    .map(([taxId]) => normalizeTaxId(taxId));
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const slug = process.argv
    .slice(2)
    .find((a) => a !== "--dry-run")?.trim();
  if (!slug) {
    console.error("Usage: restore-tenant-authoritative-uber.ts <tenant-slug> [--dry-run]");
    process.exit(1);
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, slug: true },
  });
  if (!tenant) {
    console.error("Tenant not found:", slug);
    process.exit(1);
  }

  const taxIds = authoritativeTaxIdsForSlug(slug);
  const companySpecs = companiesForTenantSlug(slug);

  console.log(
    dryRun ? "=== DRY RUN restore tenant uber ===" : "=== Restore tenant uber ===",
  );
  console.log("Tenant:", slug);
  console.log("Authoritative companies:", companySpecs.map((c) => c.legalName).join("; "));

  const companies = await prisma.company.findMany({
    where: {
      tenantId: tenant.id,
      isActive: true,
      taxId: { in: taxIds },
    },
    select: { id: true, legalName: true },
  });
  const companyIds = companies.map((c) => c.id);

  const dpas = await prisma.driverPlatformAccount.findMany({
    where: {
      tenantId: tenant.id,
      platform: RidePlatform.UBER,
      isActive: false,
      driver: { companyId: { in: companyIds } },
    },
    select: {
      id: true,
      externalDriverId: true,
      driverId: true,
      driver: { select: { fullName: true, company: { select: { legalName: true } } } },
    },
  });

  console.log(`Inactive uber links in authoritative companies: ${dpas.length}`);

  let reactivated = 0;
  for (const dpa of dpas) {
    console.log(
      `  ${dpa.driver.fullName} (${dpa.externalDriverId.slice(0, 8)}…) — ${dpa.driver.company.legalName}`,
    );
    if (dryRun) {
      reactivated += 1;
      continue;
    }
    await prisma.$transaction(async (tx) => {
      await tx.driver.update({
        where: { id: dpa.driverId },
        data: { isActive: true },
      });
      await tx.driverPlatformAccount.update({
        where: { id: dpa.id },
        data: { isActive: true },
      });
    });
    reactivated += 1;
  }

  console.log(`Done: reactivated=${reactivated}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
