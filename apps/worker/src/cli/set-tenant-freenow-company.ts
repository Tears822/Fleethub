/**
 * Persist FreeNow public company id in tenant settings.integrations.
 * Usage: npx tsx src/cli/set-tenant-freenow-company.ts trade-taxi-sl GEYDMNJUG4
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";

const workerRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
loadEnv({ path: path.join(workerRoot, "..", "..", ".env") });
loadEnv({ path: path.join(workerRoot, ".env"), override: true });

import { prisma } from "@fleethub/db";

const TRADETAXI_FREENOW_ID = "GEYDMNJUG4";

async function main() {
  const slug = process.argv[2]?.trim() || "trade-taxi-sl";
  const publicCompanyId = process.argv[3]?.trim() || TRADETAXI_FREENOW_ID;

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, slug: true, settings: true },
  });
  if (!tenant) throw new Error(`Tenant not found: ${slug}`);

  const current =
    tenant.settings && typeof tenant.settings === "object"
      ? (tenant.settings as Record<string, unknown>)
      : {};
  const integrations =
    current.integrations && typeof current.integrations === "object"
      ? { ...(current.integrations as Record<string, unknown>) }
      : {};

  const before = typeof integrations.freenowPublicCompanyId === "string"
    ? integrations.freenowPublicCompanyId
    : "";

  integrations.freenowPublicCompanyId = publicCompanyId;

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { settings: { ...current, integrations } },
  });

  console.log(`${slug}: freenowPublicCompanyId ${before || "(empty)"} → ${publicCompanyId}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
