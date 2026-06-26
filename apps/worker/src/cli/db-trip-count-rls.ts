import "../load-env.js";
import { prisma, withoutTenant, withTenantRls } from "@fleethub/db";

async function main() {
  const slug = "trade-taxi-sl";
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findFirst({ where: { slug }, select: { id: true } }),
  );
  console.log("tenant", tenant?.id);

  const superCount = await withoutTenant((tx) =>
    tx.trip.count({ where: { tenantId: tenant!.id } }),
  );
  console.log("withoutTenant count", superCount);

  if (tenant) {
    const rlsCount = await withTenantRls(tenant.id, (tx) =>
      tx.trip.count({ where: { tenantId: tenant.id } }),
    );
    console.log("withTenantRls count", rlsCount);

    const pending = await withTenantRls(tenant.id, (tx) =>
      tx.trip.count({ where: { tenantId: tenant.id, liquidationStatus: "pending" } }),
    );
    console.log("pending", pending);
  }

  await prisma.$disconnect();
}
main();
