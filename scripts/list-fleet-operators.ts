import "dotenv/config";
import { withTenant, lookupTenantIdBySlug } from "@fleethub/db";
import { isFleetOperatorCompany } from "@fleethub/auth/company-fleet-scope";

async function main() {
  const slug = process.argv[2] ?? "cosculluela";

  const tid = await lookupTenantIdBySlug(slug);
  if (!tid) {
    console.error(`Tenant not found: ${slug}`);
    process.exit(1);
  }

  const rows = await withTenant(tid, (tx) =>
    tx.company.findMany({
      where: { tenantId: tid, isActive: true },
      select: { legalName: true, taxId: true },
      orderBy: { legalName: "asc" },
    }),
  );

  const fleet = rows.filter(isFleetOperatorCompany);
  console.log(`Tenant: ${slug}`);
  console.log(`Fleet operators (${fleet.length}):`);
  for (const c of fleet) {
    console.log(`  - ${c.legalName} (${c.taxId ?? "—"})`);
  }

  const autonomos = rows.filter((c) => !isFleetOperatorCompany(c));
  if (autonomos.length > 0) {
    console.log(`Autónomo rows hidden from shell (${autonomos.length}):`);
    for (const c of autonomos) {
      console.log(`  - ${c.legalName} (${c.taxId ?? "—"})`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
