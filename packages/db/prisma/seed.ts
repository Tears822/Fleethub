/**
 * Seed: demo tenants, companies, users, drivers, trips, sync runs.
 * Run as DB owner (migrations) so RLS does not block inserts.
 */
import { hashSync } from "bcryptjs";
import { PlatformRole, PrismaClient } from "@prisma/client";
import { DEMO_PASSWORD, deactivateDemoLoginAccounts } from "./seed-helpers.js";
import { seedDemoA } from "./seed-demo-a.js";
import { seedDemoB } from "./seed-demo-b.js";
import {
  productionTenantsSeedSummary,
  seedProductionTenants,
} from "./seed-production-tenants.js";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = hashSync(DEMO_PASSWORD, 12);

  await prisma.platformUser.upsert({
    where: { email: "superadmin@fleethub.local" },
    update: {
      passwordHash,
      role: PlatformRole.SUPER_ADMIN,
      firstName: "Alvaro",
      lastName: "Tocados",
      isActive: false,
      totpEnabled: false,
      totpSecret: null,
      totpBackupHashes: null,
    },
    create: {
      email: "superadmin@fleethub.local",
      passwordHash,
      role: PlatformRole.SUPER_ADMIN,
      firstName: "Alvaro",
      lastName: "Tocados",
    },
  });

  await seedDemoA(prisma, passwordHash);
  await seedDemoB(prisma, passwordHash);
  await seedProductionTenants(prisma, passwordHash);
  await deactivateDemoLoginAccounts(prisma);

  await prisma.platformUser.updateMany({
    where: { email: "superadmin@fleethub.local" },
    data: {
      emailVerifiedAt: new Date(),
      totpEnabled: false,
      totpSecret: null,
      totpBackupHashes: null,
    },
  });

  // Demo accounts: keep smoke tests and walkthrough login password-only.
  await prisma.user.updateMany({
    where: { tenant: { slug: { in: ["demo-a", "demo-b"] } } },
    data: {
      totpEnabled: false,
      totpSecret: null,
      totpBackupHashes: null,
    },
  });

  console.log(`
Seed OK.

Tenant demo-a (BADAVI — live data via platform sync):
  After seed (worker):
    npm run import:freenow-drivers -w @fleethub/worker -- demo-a
    npm run import:uber-drivers -w @fleethub/worker -- demo-a
    npm run run-platform-sync -w @fleethub/worker -- demo-a FREENOW
    npm run run-platform-sync -w @fleethub/worker -- demo-a UBER

Tenant demo-b (synthetic UI demo): 5 conductores · viajes abr–may 2026 + hoy

Demo logins (@example.com, superadmin@fleethub.local) quedan desactivados.
${productionTenantsSeedSummary()}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
