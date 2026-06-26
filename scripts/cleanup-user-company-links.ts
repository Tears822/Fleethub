/**
 * Remove user_companies pointing at inactive or cross-tenant companies.
 *
 *   node --import tsx scripts/cleanup-user-company-links.ts
 */
import "dotenv/config";
import { prisma, withoutTenant } from "@fleethub/db";

async function main() {
  const all = await withoutTenant((tx) =>
    tx.userCompany.findMany({
      select: {
        userId: true,
        companyId: true,
        user: { select: { email: true, tenantId: true } },
        company: { select: { legalName: true, tenantId: true, isActive: true } },
      },
    }),
  );

  const toDelete = all.filter(
    (l) => !l.company.isActive || l.user.tenantId !== l.company.tenantId,
  );

  console.log("Stale / cross-tenant user_company links:", toDelete.length);
  for (const row of toDelete) {
    const flags = [
      !row.company.isActive ? "inactive" : null,
      row.user.tenantId !== row.company.tenantId ? "wrong tenant" : null,
    ]
      .filter(Boolean)
      .join(", ");
    console.log(` - ${row.user.email} → ${row.company.legalName} (${flags})`);
  }

  if (toDelete.length > 0) {
    await withoutTenant((tx) =>
      tx.userCompany.deleteMany({
        where: {
          OR: toDelete.map((r) => ({
            userId: r.userId,
            companyId: r.companyId,
          })),
        },
      }),
    );
    console.log("Deleted", toDelete.length, "link(s).");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
