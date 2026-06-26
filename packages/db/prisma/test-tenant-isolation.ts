/**
 * Cross-tenant isolation check: driver from tenant A must not be visible
 * inside withTenant(tenantB).
 *
 * Note: PostgreSQL superusers and BYPASSRLS roles skip RLS. Table owners
 * also skip RLS unless FORCE ROW LEVEL SECURITY is set. If this script
 * exits 2, use a non-privileged app role (see README: db:create-app-role).
 */
import "dotenv/config";
import { lookupTenantIdBySlug, prisma, withTenant } from "../src/index";

async function main() {
  const [whoami] = await prisma.$queryRaw<
    { rolsuper: boolean; rolbypassrls: boolean }[]
  >`SELECT r.rolsuper, r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user`;
  const privileged =
    whoami?.rolsuper === true || whoami?.rolbypassrls === true;

  const tenantAId = await lookupTenantIdBySlug("demo-a");
  const tenantBId = await lookupTenantIdBySlug("demo-b");
  if (!tenantAId || !tenantBId) {
    console.error(
      "Missing demo-a / demo-b: run npm run db:seed (as fleethub). If seed exists, run npm run db:apply-rls then npm run db:create-app-role (EXECUTE on app_lookup_tenant_by_slug)."
    );
    process.exit(1);
  }

  const driverA = await withTenant(tenantAId, (tx) =>
    tx.driver.findFirst({ where: { tenantId: tenantAId } })
  );
  const driverB = await withTenant(tenantBId, (tx) =>
    tx.driver.findFirst({ where: { tenantId: tenantBId } })
  );
  if (!driverA || !driverB) {
    console.error("Missing seed drivers.");
    process.exit(1);
  }

  const countA = await withTenant(tenantAId, (tx) =>
    tx.driver.count({ where: { id: driverA.id } })
  );
  const countBWrong = await withTenant(tenantBId, (tx) =>
    tx.driver.count({ where: { id: driverA.id } })
  );
  const countBRight = await withTenant(tenantBId, (tx) =>
    tx.driver.count({ where: { id: driverB.id } })
  );

  console.log({ countA, countBWrong, countBRight });

  if (countA !== 1 || countBRight !== 1) {
    console.error("Unexpected counts.");
    process.exit(1);
  }

  if (countBWrong !== 0) {
    if (privileged) {
      console.warn(
        "[RLS] Driver from tenant A is visible as tenant B — current DB user is superuser or has BYPASSRLS, so PostgreSQL does not enforce RLS. For a real check: npm run db:create-app-role (as fleethub), then DATABASE_URL with user fleethub_app and npm run test:tenant again."
      );
    } else {
      console.warn(
        "[RLS] Driver from tenant A is visible as tenant B — DB user may be table owner (RLS bypass). Use a dedicated app role without BYPASSRLS in production."
      );
    }
    process.exit(2);
  }

  console.log("RLS isolation OK (tenant B cannot see tenant A driver).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
