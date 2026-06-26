/**
 * Purge inactive BADAVI clone drivers (wrong tenant) + reactivate cosculluela Uber links.
 *
 * Usage:
 *   npx tsx src/cli/fix-no-platform-drivers.ts [--dry-run]
 */
import "../load-env.js";
import { prisma, RidePlatform, withoutTenant } from "@fleethub/db";
import { DEFAULT_FREENOW_PUBLIC_COMPANY_BY_TENANT_SLUG } from "../lib/freenow-tenant-company-map.js";
import {
  listAllUberDrivers,
  resolveUberOrgForTenantSlug,
  uberDriverDisplayName,
  uberDriverExternalId,
} from "../lib/uber-fleet-client.js";

const BADAVI_FN_ID = DEFAULT_FREENOW_PUBLIC_COMPANY_BY_TENANT_SLUG.cosculluela!;

function fnCompanyFromMeta(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const v = (metadata as { freenowPublicCompanyId?: unknown }).freenowPublicCompanyId;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

async function purgeTenantClones(slug: "trevino" | "trade-taxi-sl", dryRun: boolean) {
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug }, select: { id: true, name: true } }),
  );
  if (!tenant) throw new Error(`tenant ${slug} not found`);

  const tenantFnId = DEFAULT_FREENOW_PUBLIC_COMPANY_BY_TENANT_SLUG[slug];
  console.log(`\n=== Purge clones: ${slug} ===`);

  const drivers = await withoutTenant(
    (tx) =>
      tx.driver.findMany({
        where: { tenantId: tenant.id, isActive: false },
        select: {
          id: true,
          fullName: true,
          driverPlatformAccounts: {
            select: {
              id: true,
              platform: true,
              isActive: true,
              externalDriverId: true,
              metadata: true,
            },
          },
          _count: { select: { trips: true } },
        },
      }),
    undefined,
    tenant.id,
  );

  let purged = 0;
  for (const d of drivers) {
    const hasActive = d.driverPlatformAccounts.some((a) => a.isActive);
    if (hasActive || d._count.trips > 0) continue;

    const wrongBadaviFn = d.driverPlatformAccounts.some(
      (a) => fnCompanyFromMeta(a.metadata) === BADAVI_FN_ID,
    );
    const allInactive = d.driverPlatformAccounts.every((a) => !a.isActive);
    if (!allInactive && d.driverPlatformAccounts.length > 0) continue;

    // Inactive shell with BADAVI FN link and/or no live platform — clone from umbrella leak.
    const isClone =
      wrongBadaviFn ||
      (d.driverPlatformAccounts.length > 0 && d.driverPlatformAccounts.every((a) => !a.isActive));

    if (!isClone) continue;

    console.log(
      `  DELETE ${d.fullName} (dpa=${d.driverPlatformAccounts.length}, trips=0)`,
    );
    if (dryRun) {
      purged += 1;
      continue;
    }

    await withoutTenant(
      async (tx) => {
        await tx.driverPlatformAccount.deleteMany({ where: { driverId: d.id } });
        await tx.driver.delete({ where: { id: d.id } });
      },
      undefined,
      tenant.id,
    );
    purged += 1;
  }

  console.log(`  purged=${purged}`);
}

async function reactivateCosculluelaUber(dryRun: boolean) {
  const slug = "cosculluela";
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug }, select: { id: true, name: true } }),
  );
  if (!tenant) throw new Error("cosculluela not found");

  console.log(`\n=== Reactivate cosculluela Uber links ===`);

  const org = await resolveUberOrgForTenantSlug(slug);
  if (!org.ok) throw new Error(org.message);

  const api = await listAllUberDrivers(org.data.orgId);
  if (!api.ok) throw new Error(api.message);

  const apiById = new Map<string, string>();
  for (const row of api.data) {
    const id = uberDriverExternalId(row);
    if (id) apiById.set(id.toLowerCase(), uberDriverDisplayName(row));
  }

  const inactiveUber = await withoutTenant(
    (tx) =>
      tx.driverPlatformAccount.findMany({
        where: {
          tenantId: tenant.id,
          platform: RidePlatform.UBER,
          isActive: false,
          driver: { isActive: false },
        },
        select: {
          id: true,
          externalDriverId: true,
          driverId: true,
          driver: { select: { fullName: true, email: true, dni: true } },
        },
      }),
    undefined,
    tenant.id,
  );

  let reactivated = 0;
  for (const dpa of inactiveUber) {
    const ext = dpa.externalDriverId.trim().toLowerCase();
    if (!apiById.has(ext)) {
      console.log(`  skip ${dpa.driver.fullName} — UUID not in Badavi Uber API`);
      continue;
    }

    console.log(
      `  REACTIVATE ${dpa.driver.fullName} uber=${ext.slice(0, 8)}… (${apiById.get(ext)})`,
    );
    if (dryRun) {
      reactivated += 1;
      continue;
    }

    await withoutTenant(
      async (tx) => {
        await tx.driver.update({
          where: { id: dpa.driverId },
          data: { isActive: true },
        });
        await tx.driverPlatformAccount.update({
          where: { id: dpa.id },
          data: {
            isActive: true,
            metadata: {
              source: "reactivate_badavi_uber",
              reactivatedAt: new Date().toISOString(),
            },
          },
        });
      },
      undefined,
      tenant.id,
    );
    reactivated += 1;
  }

  console.log(`  reactivated=${reactivated}`);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(dryRun ? "=== DRY RUN fix no-platform drivers ===" : "=== Fix no-platform drivers ===");

  await purgeTenantClones("trevino", dryRun);
  await purgeTenantClones("trade-taxi-sl", dryRun);
  await reactivateCosculluelaUber(dryRun);

  if (!dryRun) {
    console.log("\n=== Verify ===");
    for (const slug of ["trevino", "trade-taxi-sl", "cosculluela"]) {
      const tenant = await withoutTenant((tx) =>
        tx.tenant.findUnique({ where: { slug }, select: { id: true } }),
      );
      if (!tenant) continue;
      const noPlatform = await withoutTenant(
        (tx) =>
          tx.driver.count({
            where: {
              tenantId: tenant.id,
              driverPlatformAccounts: { none: { isActive: true } },
            },
          }),
        undefined,
        tenant.id,
      );
      const inactive = await withoutTenant(
        (tx) => tx.driver.count({ where: { tenantId: tenant.id, isActive: false } }),
        undefined,
        tenant.id,
      );
      console.log(`${slug}: drivers without active platform=${noPlatform}, inactive drivers=${inactive}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
