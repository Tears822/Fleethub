/**
 * Sync FleetHub ↔ Uber drivers (import from API + link by name).
 * Usage: npm run sync:uber-drivers -w @fleethub/worker -- demo-a
 *    or: npm run sync:uber-drivers -w @fleethub/worker -- <tenant-uuid>
 */
import path from "node:path";
import { config } from "dotenv";
import { prisma } from "@fleethub/db";
import {
  listAllUberDrivers,
  resolveUberOrgId,
  uberDriverDisplayName,
} from "../lib/uber-fleet-client.js";
import { syncUberDriversForTenant } from "../lib/platform-driver-sync.js";

config({ path: path.resolve(process.cwd(), "../../.env") });
config({ path: path.resolve(process.cwd(), ".env"), override: true });

async function resolveTenantId(arg: string): Promise<string | null> {
  const trimmed = arg.trim();
  if (!trimmed) return null;

  if (trimmed.includes("-") && trimmed.length >= 32) {
    const byId = await prisma.tenant.findUnique({
      where: { id: trimmed },
      select: { id: true },
    });
    if (byId) return byId.id;
  }

  const bySlug = await prisma.tenant.findUnique({
    where: { slug: trimmed },
    select: { id: true },
  });
  return bySlug?.id ?? null;
}

async function main() {
  const arg = process.argv[2]?.trim();
  if (!arg) {
    console.error("Usage: npm run sync:uber-drivers -w @fleethub/worker -- <tenant-slug|tenant-uuid>");
    console.error("Example: npm run sync:uber-drivers -w @fleethub/worker -- demo-a");
    process.exit(1);
  }

  const tenantId = await resolveTenantId(arg);
  if (!tenantId) {
    console.error(`Tenant not found: ${arg}`);
    process.exit(1);
  }

  const org = await resolveUberOrgId();
  if (!org.ok) {
    console.error("Error:", org.message);
    process.exit(1);
  }

  const uberList = await listAllUberDrivers(org.data);
  if (!uberList.ok) {
    console.error("Error:", uberList.message);
    process.exit(1);
  }

  const result = await syncUberDriversForTenant(tenantId);
  if (!result.ok) {
    console.error("Error:", result.message);
    process.exit(1);
  }

  console.log("Tenant:", arg, "→", tenantId);
  console.log("Uber org_id:", `${org.data.slice(0, 16)}…`);
  console.log("Uber drivers in org:", result.platformDrivers);
  if (uberList.data.length > 0) {
    console.log("Uber names:");
    for (const row of uberList.data.slice(0, 15)) {
      const name = uberDriverDisplayName(row);
      if (name) console.log(" -", name);
    }
  }
  console.log("FleetHub drivers created:", result.created);
  console.log("FleetHub drivers linked:", result.linked);
  if (result.linked === 0 && result.platformDrivers > 0 && result.created === 0) {
    console.log(
      "Tip: conductor fullName must match Uber exactly (accents/spacing). Check /conductores.",
    );
  } else if (result.platformDrivers === 0) {
    console.log("Tip: no drivers returned for this org — confirm UBER_ORG_ID and fleet linkage in Uber.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
