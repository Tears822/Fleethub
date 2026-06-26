import "dotenv/config";
import { prisma } from "@fleethub/db";

async function main() {
  const tenants = await prisma.tenant.findMany({
    select: { id: true, slug: true, name: true },
    orderBy: { slug: "asc" },
  });
  console.log("TENANTS:", tenants);

  for (const t of tenants) {
    const companies = await prisma.company.findMany({
      where: { tenantId: t.id, isActive: true },
      select: {
        id: true,
        legalName: true,
        taxId: true,
        _count: { select: { drivers: true } },
      },
      orderBy: { legalName: "asc" },
    });
    console.log(`\n=== ${t.slug} (${t.name}) — ${companies.length} companies ===`);
    for (const c of companies) {
      console.log(`  ${c.taxId ?? "—"} | ${c.legalName} | drivers=${c._count.drivers} | id=${c.id}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
