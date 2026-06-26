/**
 * Audit drivers + platform accounts + trips across group tenants.
 *
 * Usage: npm run audit:group-tenants -w @fleethub/worker
 */
import path from "node:path";
import { config } from "dotenv";
import {
  GROUP_TENANT_COMPANY_BY_TAX_ID,
  normalizeTaxId,
  tenantSlugForTaxId,
} from "@fleethub/auth/group-tenant-company-map";
import { prisma, RidePlatform } from "@fleethub/db";

config({ path: path.resolve(process.cwd(), "../../.env") });

const GROUP_SLUGS = ["cosculluela", "trevino", "trade-taxi-sl"] as const;

type Issue = { severity: "error" | "warn"; code: string; detail: string };

function expectedSlugForCompany(taxId: string | null, tenantSlug: string): boolean {
  const expected = tenantSlugForTaxId(taxId);
  if (!expected) return true; // unknown CIF — manual review
  return expected === tenantSlug;
}

async function main() {
  const issues: Issue[] = [];
  const tenants = await prisma.tenant.findMany({
    where: { slug: { in: [...GROUP_SLUGS] } },
    select: { id: true, slug: true },
  });

  console.log("=== Group tenant isolation audit ===\n");

  // 1. Drivers assigned to company CIF outside their tenant
  for (const tenant of tenants) {
    const drivers = await prisma.driver.findMany({
      where: { tenantId: tenant.id, isActive: true },
      select: {
        id: true,
        fullName: true,
        company: { select: { legalName: true, taxId: true } },
      },
    });
    let wrongCompany = 0;
    for (const d of drivers) {
      if (!expectedSlugForCompany(d.company.taxId, tenant.slug)) {
        wrongCompany += 1;
        const expected = tenantSlugForTaxId(d.company.taxId);
        issues.push({
          severity: "error",
          code: "driver_wrong_tenant_company",
          detail: `${tenant.slug}: ${d.fullName} → ${d.company.legalName} (${d.company.taxId}) belongs to tenant ${expected}`,
        });
      }
    }
    console.log(
      `${tenant.slug}: ${drivers.length} active drivers, ${wrongCompany} with company CIF mapped to another tenant`,
    );
  }

  // 2. Active platform account duplicates across group tenants
  for (const platform of [RidePlatform.UBER, RidePlatform.FREENOW]) {
    const rows = await prisma.driverPlatformAccount.findMany({
      where: {
        platform,
        isActive: true,
        tenantId: { in: tenants.map((t) => t.id) },
        externalDriverId: { not: { startsWith: "seed-" } },
      },
      select: {
        externalDriverId: true,
        tenantId: true,
        metadata: true,
        driver: { select: { fullName: true } },
      },
    });
    const byExt = new Map<string, typeof rows>();
    for (const row of rows) {
      const key =
        platform === RidePlatform.UBER
          ? row.externalDriverId.trim().toLowerCase()
          : row.externalDriverId.trim().toUpperCase();
      const list = byExt.get(key) ?? [];
      list.push(row);
      byExt.set(key, list);
    }
    let dupes = 0;
    for (const [ext, list] of byExt) {
      const slugSet = new Set(
        list.map((r) => tenants.find((t) => t.id === r.tenantId)?.slug ?? "?"),
      );
      if (slugSet.size < 2) continue;
      dupes += 1;
      const names = list
        .map((r) => {
          const slug = tenants.find((t) => t.id === r.tenantId)?.slug;
          const src =
            r.metadata && typeof r.metadata === "object" && "source" in r.metadata
              ? String((r.metadata as { source?: unknown }).source ?? "")
              : "";
          return `${slug}:${r.driver.fullName}(${src})`;
        })
        .join("; ");
      issues.push({
        severity: "error",
        code: `duplicate_${platform}_account`,
        detail: `${ext.slice(0, 12)}… active in ${[...slugSet].join(", ")} — ${names}`,
      });
    }
    console.log(
      `${platform}: ${rows.length} active accounts, ${dupes} external ids shared across tenants`,
    );
  }

  // 3. Same Uber trip UUID in multiple tenants (data leak)
  const tripDupes = await prisma.$queryRaw<
    Array<{ external_trip_id: string; tenant_count: number; slugs: string }>
  >`
    SELECT t.external_trip_id,
           COUNT(DISTINCT t.tenant_id)::int AS tenant_count,
           array_to_string(array_agg(DISTINCT tn.slug ORDER BY tn.slug), ',') AS slugs
    FROM trips t
    JOIN tenants tn ON tn.id = t.tenant_id
    WHERE t.platform = 'UBER'
      AND tn.slug IN ('cosculluela', 'trevino', 'trade-taxi-sl')
      AND t.started_at >= NOW() - interval '14 days'
    GROUP BY t.external_trip_id
    HAVING COUNT(DISTINCT t.tenant_id) > 1
    ORDER BY tenant_count DESC
    LIMIT 20
  `;
  console.log(
    `Uber trips (14d): ${tripDupes.length} external_trip_ids duplicated across tenants (showing up to 20)`,
  );
  for (const row of tripDupes.slice(0, 10)) {
    issues.push({
      severity: "warn",
      code: "duplicate_uber_trip",
      detail: `${row.external_trip_id.slice(0, 12)}… in ${row.slugs} (${row.tenant_count} tenants)`,
    });
  }

  // 4. Pending trips referencing inactive / wrong-tenant drivers
  for (const tenant of tenants) {
    const badPending = await prisma.trip.count({
      where: {
        tenantId: tenant.id,
        liquidationStatus: "pending",
        driver: { isActive: false },
      },
    });
    if (badPending > 0) {
      issues.push({
        severity: "warn",
        code: "pending_inactive_driver",
        detail: `${tenant.slug}: ${badPending} pending trips on inactive drivers`,
      });
    }
    console.log(`${tenant.slug}: ${badPending} pending trips on inactive drivers`);
  }

  const errors = issues.filter((i) => i.severity === "error");
  const warns = issues.filter((i) => i.severity === "warn");

  console.log("\n=== Issues ===");
  if (issues.length === 0) {
    console.log("No issues found.");
  } else {
    for (const i of errors) console.log(`ERROR [${i.code}] ${i.detail}`);
    for (const i of warns) console.log(`WARN  [${i.code}] ${i.detail}`);
  }

  console.log(`\n=== Summary ===`);
  console.log(`Errors: ${errors.length}, Warnings: ${warns.length}`);
  console.log(
    `Authoritative companies: cosculluela=${Object.values(GROUP_TENANT_COMPANY_BY_TAX_ID).filter((c) => c.tenantSlug === "cosculluela").length}, trevino=${Object.values(GROUP_TENANT_COMPANY_BY_TAX_ID).filter((c) => c.tenantSlug === "trevino").length}, trade-taxi-sl=${Object.values(GROUP_TENANT_COMPANY_BY_TAX_ID).filter((c) => c.tenantSlug === "trade-taxi-sl").length}`,
  );

  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
