/**
 * Verify tenant FreeNow/Uber integration settings.
 * Usage: npx tsx src/cli/verify-tenant-platform-ids.ts trade-taxi-sl
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { getTenantIntegrationSettings } from "@fleethub/auth";
import { resolveTenantFreenowPublicCompanyId } from "../lib/tenant-platform-config.js";

const workerRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
loadEnv({ path: path.join(workerRoot, "..", "..", ".env") });
loadEnv({ path: path.join(workerRoot, ".env"), override: true });

const prisma = new PrismaClient();

async function main() {
  const slug = process.argv[2]?.trim() || "trade-taxi-sl";
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, slug: true, settings: true },
  });
  if (!tenant) throw new Error(`Tenant not found: ${slug}`);

  const settings = await getTenantIntegrationSettings(tenant.id);
  const resolvedFn = await resolveTenantFreenowPublicCompanyId(tenant.id);

  console.log(`${slug} (${tenant.id})`);
  console.log(`  settings.freenowPublicCompanyId: ${settings.freenowPublicCompanyId || "(empty)"}`);
  console.log(`  settings.uberOrgId: ${settings.uberOrgId ? settings.uberOrgId.slice(0, 32) + "…" : "(empty)"}`);
  console.log(`  resolveTenantFreenowPublicCompanyId: ${resolvedFn}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
