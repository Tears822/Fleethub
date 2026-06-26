/**
 * Clear demo-a operational data (drivers, trips, sync) — keeps tenant, users, company.
 * Usage: npm run clear:demo-a -w @fleethub/db
 */
import { PrismaClient } from "@prisma/client";
import { clearTenantOperativaData } from "./seed-demo-synthetic.js";

const prisma = new PrismaClient();

const tenant = await prisma.tenant.findUnique({ where: { slug: "demo-a" } });
if (!tenant) {
  console.error("Tenant demo-a not found. Run npm run db:seed from repo root first.");
  process.exit(1);
}

await clearTenantOperativaData(prisma, tenant.id);
console.log("demo-a operativa cleared (drivers, trips, sync_runs, metrics, liquidations).");
console.log("Next: import:freenow-drivers / import:uber-drivers + run-platform-sync");

await prisma.$disconnect();
