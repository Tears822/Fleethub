/**
 * Import FreeNow ACTIVE drivers into FleetHub (demo-a live data).
 * Usage: npm run import:freenow-drivers -w @fleethub/worker -- demo-a [GEYTMOBQGE]
 */
import path from "node:path";
import { config } from "dotenv";
import { prisma } from "@fleethub/db";
import { importFreenowDriversForTenant } from "../lib/freenow-import-drivers.js";
import { freenowEnvReady } from "../lib/freenow-env.js";

config({ path: path.resolve(process.cwd(), "../../.env") });
config({ path: path.resolve(process.cwd(), ".env"), override: true });

async function resolveTenantId(arg: string): Promise<string | null> {
  const trimmed = arg.trim();
  if (!trimmed) return null;
  if (trimmed.includes("-") && trimmed.length >= 32) {
    const byId = await prisma.tenant.findUnique({ where: { id: trimmed }, select: { id: true } });
    if (byId) return byId.id;
  }
  const bySlug = await prisma.tenant.findUnique({ where: { slug: trimmed }, select: { id: true } });
  return bySlug?.id ?? null;
}

async function main() {
  const slug = process.argv[2]?.trim() || "demo-a";
  const publicCompanyId =
    process.argv[3]?.trim() || process.env.FREENOW_PUBLIC_COMPANY_ID?.trim() || "GEYTMOBQGE";

  if (!freenowEnvReady().ok) {
    console.error("Missing FREENOW_CLIENT_ID / FREENOW_CLIENT_SECRET");
    process.exit(1);
  }

  const tenantId = await resolveTenantId(slug);
  if (!tenantId) {
    console.error("Tenant not found:", slug);
    process.exit(1);
  }

  const result = await importFreenowDriversForTenant(tenantId, publicCompanyId);
  if (!result.ok) {
    console.error("Import failed:", result.message);
    process.exit(1);
  }

  console.log("Tenant:", slug);
  console.log("FreeNow company:", publicCompanyId);
  console.log("Drivers in API (ACTIVE):", result.total);
  console.log("FleetHub drivers created:", result.created);
  console.log("Platform accounts linked:", result.linked);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
