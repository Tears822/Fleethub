/**
 * Sync FleetHub ↔ FreeNow drivers (import from API + link by name).
 * Usage: npm run sync:freenow-drivers -w @fleethub/worker -- demo-a [GEYTMOBQGE]
 */
import path from "node:path";
import { config } from "dotenv";
import { prisma } from "@fleethub/db";
import { listAllFreenowCompanyDrivers, freenowDriverDisplayName, freenowPublicDriverId } from "../lib/freenow-client.js";
import { resolveFreenowFleetCompanyMappings } from "../lib/freenow-company-map.js";
import { syncFreenowDriversForAllLinkedCompanies } from "../lib/platform-driver-sync.js";
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
  const arg = process.argv[2]?.trim();
  const publicCompanyId =
    process.argv[3]?.trim() || process.env.FREENOW_PUBLIC_COMPANY_ID?.trim() || "GEYTMOBQGE";

  if (!arg) {
    console.error("Usage: npm run sync:freenow-drivers -w @fleethub/worker -- <tenant-slug> [publicCompanyId]");
    process.exit(1);
  }
  if (!freenowEnvReady().ok) {
    console.error("Missing FREENOW_CLIENT_ID / FREENOW_CLIENT_SECRET");
    process.exit(1);
  }

  const tenantId = await resolveTenantId(arg);
  if (!tenantId) {
    console.error("Tenant not found:", arg);
    process.exit(1);
  }

  const fnList = await listAllFreenowCompanyDrivers(publicCompanyId, { status: "ACTIVE" });
  if (!fnList.ok) {
    console.error("Error:", fnList.message);
    process.exit(1);
  }

  const mappings = await resolveFreenowFleetCompanyMappings(tenantId);
  console.log("Tenant:", arg, "→", tenantId);
  console.log(
    "Fleet ↔ FreeNow mappings:",
    mappings.map((m) => `${m.fleetLegalName} ↔ ${m.publicCompanyId}`).join("; ") || "(none)",
  );

  const result = await syncFreenowDriversForAllLinkedCompanies(tenantId);
  if (!result.ok) {
    console.error("Error:", result.message);
    process.exit(1);
  }

  console.log("FreeNow sample company:", publicCompanyId);
  console.log("FreeNow drivers (ACTIVE, sample):", fnList.drivers.length);
  for (const d of fnList.drivers.slice(0, 15)) {
    console.log(" -", freenowPublicDriverId(d), freenowDriverDisplayName(d));
  }
  console.log("FleetHub drivers created:", result.created);
  console.log("FleetHub drivers linked:", result.linked);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
