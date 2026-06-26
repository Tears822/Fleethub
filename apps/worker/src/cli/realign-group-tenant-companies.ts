/**
 * Move empresas/conductores al tenant correcto según CIF (Excel cliente).
 *
 *   npm run realign:group-tenants -w @fleethub/worker -- --dry-run
 *   npm run realign:group-tenants -w @fleethub/worker
 */
import path from "node:path";
import { config } from "dotenv";
import { Prisma, prisma, TenantRole, withoutTenant } from "@fleethub/db";
import {
  GROUP_TENANT_COMPANY_BY_TAX_ID,
  normalizeTaxId,
  type GroupTenantCompanySpec,
} from "../lib/group-tenant-company-map.js";

// Owner role only — cross-tenant moves require BYPASSRLS (do not load worker .env override).
config({ path: path.resolve(process.cwd(), "../../.env") });

type CompanyRow = {
  id: string;
  tenantId: string;
  legalName: string;
  taxId: string | null;
  tenantSlug: string;
  driverCount: number;
};

async function ensureTenant(slug: string, name: string) {
  return prisma.tenant.upsert({
    where: { slug },
    update: { name, commercialStatus: "ACTIVE", trialEndsAt: null },
    create: { slug, name, commercialStatus: "ACTIVE" },
    select: { id: true, slug: true, name: true },
  });
}

/** System placeholder for super-admin impersonation — only when no real tenant admin exists. */
async function ensureTenantAdmin(tenantId: string, slug: string, managerName: string) {
  const realAdmin = await prisma.user.findFirst({
    where: {
      tenantId,
      isActive: true,
      role: TenantRole.ADMIN_TENANT,
      email: { not: { endsWith: "@fleethub.local" } },
    },
    select: { id: true },
  });
  if (realAdmin) return realAdmin;

  const email = `admin-${slug}@fleethub.local`;
  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId, email } },
    update: {
      role: TenantRole.ADMIN_TENANT,
      firstName: "Admin",
      lastName: managerName,
      isActive: true,
    },
    create: {
      tenantId,
      email,
      passwordHash: "!", // login via super-admin impersonation / reset
      role: TenantRole.ADMIN_TENANT,
      firstName: "Admin",
      lastName: managerName,
      emailVerifiedAt: new Date(),
    },
    select: { id: true },
  });
  return admin;
}

async function ensureCompany(tenantId: string, taxId: string, spec: GroupTenantCompanySpec) {
  const normalizedTaxId = normalizeTaxId(taxId);
  return prisma.company.upsert({
    where: { tenantId_taxId: { tenantId, taxId: normalizedTaxId } },
    update: { legalName: spec.legalName, isActive: true },
    create: {
      tenantId,
      taxId: normalizedTaxId,
      legalName: spec.legalName,
      isActive: true,
      profile: {},
    },
    select: { id: true, legalName: true, tenantId: true },
  });
}

async function linkAdminToCompany(userId: string, companyId: string) {
  await prisma.userCompany.upsert({
    where: { userId_companyId: { userId, companyId } },
    update: {},
    create: { userId, companyId },
  });
}

async function countDrivers(companyId: string) {
  return prisma.driver.count({ where: { companyId } });
}

async function relocateCompanyOperations(
  tx: Prisma.TransactionClient,
  sourceCompanyId: string,
  sourceTenantId: string,
  targetTenantId: string,
  targetCompanyId: string,
) {
  const drivers = await tx.driver.findMany({
    where: { companyId: sourceCompanyId },
    select: { id: true },
  });
  const driverIds = drivers.map((d) => d.id);
  if (driverIds.length === 0) {
    return { drivers: 0 };
  }

  await tx.driver.updateMany({
    where: { id: { in: driverIds } },
    data: { tenantId: targetTenantId, companyId: targetCompanyId },
  });
  await tx.driverPlatformAccount.updateMany({
    where: { driverId: { in: driverIds } },
    data: { tenantId: targetTenantId },
  });
  await tx.driverVehicleAssignment.updateMany({
    where: { driverId: { in: driverIds } },
    data: { tenantId: targetTenantId },
  });
  await tx.trip.updateMany({
    where: { driverId: { in: driverIds } },
    data: { tenantId: targetTenantId },
  });
  await tx.shiftLiquidation.updateMany({
    where: { driverId: { in: driverIds } },
    data: { tenantId: targetTenantId },
  });
  await tx.driverPlatformDayMetric.updateMany({
    where: { driverId: { in: driverIds } },
    data: { tenantId: targetTenantId },
  });

  return { drivers: driverIds.length };
}

async function loadCompaniesByTaxId(): Promise<Map<string, CompanyRow[]>> {
  const rows = await withoutTenant((tx) =>
    tx.company.findMany({
      where: { taxId: { not: null } },
      select: {
        id: true,
        tenantId: true,
        legalName: true,
        taxId: true,
        tenant: { select: { slug: true } },
        _count: { select: { drivers: true } },
      },
    }),
  );

  const map = new Map<string, CompanyRow[]>();
  for (const row of rows) {
    const key = normalizeTaxId(row.taxId);
    if (!key) continue;
    const entry: CompanyRow = {
      id: row.id,
      tenantId: row.tenantId,
      legalName: row.legalName,
      taxId: row.taxId,
      tenantSlug: row.tenant.slug,
      driverCount: row._count.drivers,
    };
    const list = map.get(key) ?? [];
    list.push(entry);
    map.set(key, list);
  }
  return map;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log("=== Realign group tenant companies (client Excel) ===");
  console.log("Dry run:", dryRun);

  const companiesByTaxId = await loadCompaniesByTaxId();
  const actions: string[] = [];
  let totalDrivers = 0;

  for (const [taxId, spec] of Object.entries(GROUP_TENANT_COMPANY_BY_TAX_ID)) {
    const normalized = normalizeTaxId(taxId);
    const siblings = companiesByTaxId.get(normalized) ?? [];

    if (!dryRun) {
      const tenant = await ensureTenant(spec.tenantSlug, spec.tenantName);
      const canonical = await ensureCompany(tenant.id, taxId, spec);
      const admin = await ensureTenantAdmin(tenant.id, spec.tenantSlug, spec.tenantName);
      await linkAdminToCompany(admin.id, canonical.id);

      for (const source of siblings) {
        if (source.id === canonical.id) continue;

        const drivers = source.driverCount;
        actions.push(
          `MOVE ${drivers} drivers: ${source.legalName} (${source.tenantSlug}) → ${canonical.legalName} (${spec.tenantSlug})`,
        );
        totalDrivers += drivers;

        await prisma.$transaction(async (tx) => {
          const moved = await relocateCompanyOperations(
            tx,
            source.id,
            source.tenantId,
            tenant.id,
            canonical.id,
          );
          if (moved.drivers === 0 && source.driverCount === 0) {
            await tx.company.delete({ where: { id: source.id } });
          } else if (moved.drivers > 0 || source.tenantId !== tenant.id) {
            await tx.company.update({
              where: { id: source.id },
              data: { isActive: false },
            });
          }
        });
      }
    } else {
      const tenantExists = await withoutTenant((tx) =>
        tx.tenant.findUnique({
          where: { slug: spec.tenantSlug },
          select: { id: true },
        }),
      );
      const canonicalInTarget = tenantExists
        ? await withoutTenant((tx) =>
            tx.company.findFirst({
              where: { tenantId: tenantExists.id, taxId: normalized },
              select: { id: true, legalName: true },
            }),
          )
        : null;

      if (!tenantExists) {
        actions.push(`WOULD CREATE tenant: ${spec.tenantSlug} (${spec.tenantName})`);
      }
      if (tenantExists && !canonicalInTarget) {
        actions.push(`WOULD CREATE company: ${spec.legalName} in ${spec.tenantSlug}`);
      }

      for (const source of siblings) {
        if (source.tenantSlug === spec.tenantSlug && canonicalInTarget && source.id === canonicalInTarget.id) {
          continue;
        }
        if (source.driverCount === 0 && source.tenantSlug !== spec.tenantSlug) {
          actions.push(`WOULD DELETE empty duplicate: ${source.legalName} (${source.tenantSlug})`);
          continue;
        }
        if (source.driverCount === 0 && source.tenantSlug === spec.tenantSlug) continue;

        actions.push(
          `WOULD MOVE ${source.driverCount} drivers: ${source.legalName} (${source.tenantSlug}) → ${spec.legalName} (${spec.tenantSlug})`,
        );
        totalDrivers += source.driverCount;
      }
    }
  }

  console.log("\nActions:", actions.length);
  for (const line of actions) console.log(" -", line);
  console.log("\nTotal drivers affected:", totalDrivers);

  const obsoleteSlugs = ["taxi-business-sl"];
  for (const slug of obsoleteSlugs) {
    const tenant = await withoutTenant((tx) =>
      tx.tenant.findUnique({
        where: { slug },
        select: {
          id: true,
          slug: true,
          companies: { where: { isActive: true }, select: { id: true } },
        },
      }),
    );
    if (!tenant) continue;
    if (tenant.companies.length > 0) {
      console.log(`\nObsolete tenant ${slug} still has active companies — not suspending`);
      continue;
    }
    const line = `SUSPEND obsolete tenant: ${slug} (no active companies)`;
    if (dryRun) {
      console.log("WOULD", line);
    } else {
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { commercialStatus: "SUSPENDED" },
      });
      console.log(line);
    }
  }

  if (dryRun) {
    console.log("(dry-run — no writes)");
  } else {
    console.log("Done.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
