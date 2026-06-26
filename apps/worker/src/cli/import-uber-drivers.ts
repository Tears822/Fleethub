/**
 * Import Uber fleet drivers into FleetHub (demo-a live data).
 * Usage: npm run import:uber-drivers -w @fleethub/worker -- demo-a
 */
import path from "node:path";
import { config } from "dotenv";
import { prisma } from "@fleethub/db";
import { importUberDriversForTenant } from "../lib/uber-import-drivers.js";
import {
  uberDriverDisplayName,
  uberDriverExternalId,
  listAllUberDrivers,
  resolveUberOrgId,
} from "../lib/uber-fleet-client.js";
import { uberFleetEnvReady } from "../lib/uber-fleet-env.js";

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

  if (!uberFleetEnvReady().ok) {
    console.error("Missing UBER_CLIENT_ID / UBER_CLIENT_SECRET (and UBER_ORG_ID if required)");
    process.exit(1);
  }

  const tenantId = await resolveTenantId(slug);
  if (!tenantId) {
    console.error("Tenant not found:", slug);
    process.exit(1);
  }

  const result = await importUberDriversForTenant(tenantId);
  if (!result.ok) {
    console.error("Import failed:", result.message);
    process.exit(1);
  }

  const org = await resolveUberOrgId();
  if (org.ok) {
    const list = await listAllUberDrivers(org.data);
    if (list.ok) {
      for (const row of list.data) {
        const name = uberDriverDisplayName(row);
        const id = uberDriverExternalId(row);
        if (name && id) {
          console.log(" -", name);
          console.log("     driverId:", id);
        }
      }
    }
  }

  console.log("Tenant:", slug);
  console.log("Uber org_id:", `${result.orgId.slice(0, 16)}…`);
  console.log("Drivers in Uber org:", result.total);
  console.log("FleetHub drivers created:", result.created);
  console.log("UBER platform accounts linked:", result.linked);
  console.log("Next: npm run run-platform-sync -w @fleethub/worker --", slug, "UBER");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
