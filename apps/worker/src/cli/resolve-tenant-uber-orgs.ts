/**
 * Print Uber org mapping per group tenant.
 * Usage: npx tsx src/cli/run-with-worker-uber-env.ts src/cli/resolve-tenant-uber-orgs.ts
 */
import path from "node:path";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import {
  listAllUberDrivers,
  resolveUberOrgForTenantSlug,
  uberDriverDisplayName,
  uberDriverExternalId,
} from "../lib/uber-fleet-client.js";
import { DEFAULT_UBER_ORG_BY_TENANT_SLUG } from "../lib/uber-tenant-org-map.js";

config({ path: path.resolve(process.cwd(), "../../packages/db/.env") });

const prisma = new PrismaClient();

const SLUGS = ["cosculluela", "trade-taxi-sl", "trevino"] as const;

async function main() {
  console.log("=== Tenant → Uber org mapping ===\n");

  for (const slug of SLUGS) {
    const org = await resolveUberOrgForTenantSlug(slug);
    if (!org.ok) {
      console.log(`${slug}: ERROR ${org.message}`);
      continue;
    }
    const drivers = await listAllUberDrivers(org.data.orgId);
    const count = drivers.ok ? drivers.data.length : 0;
    const preset = DEFAULT_UBER_ORG_BY_TENANT_SLUG[slug];
    console.log(`${slug}`);
    console.log(`  org: ${org.data.orgName}`);
    console.log(`  id:  ${org.data.orgId.slice(0, 32)}…`);
    console.log(`  drivers API: ${drivers.ok ? count : drivers.message}`);
    if (preset && preset.orgId !== org.data.orgId) {
      console.log(`  note: differs from baked-in default`);
    }
    if (drivers.ok) {
      for (const d of drivers.data.slice(0, 5)) {
        console.log(`    - ${uberDriverDisplayName(d)} (${uberDriverExternalId(d)?.slice(0, 8) ?? "?"})`);
      }
      if (drivers.data.length > 5) console.log(`    … +${drivers.data.length - 5} more`);
    }
    console.log("");
  }

  const tenants = await prisma.tenant.findMany({
    where: { slug: { in: [...SLUGS] } },
    select: { slug: true, settings: true },
  });
  for (const t of tenants) {
    const uberOrgId = (t.settings as { integrations?: { uberOrgId?: string } } | null)?.integrations
      ?.uberOrgId;
    if (uberOrgId) console.log(`settings override ${t.slug}: ${uberOrgId.slice(0, 32)}…`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
