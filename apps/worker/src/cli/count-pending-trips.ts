import "../load-env.js";
import { withoutTenant } from "@fleethub/db";

async function main() {
  const tenants = await withoutTenant((tx) =>
    tx.tenant.findMany({
      where: { commercialStatus: "ACTIVE" },
      select: { id: true, slug: true },
    }),
  );
  for (const t of tenants) {
    const n = await withoutTenant((tx) =>
      tx.trip.count({ where: { tenantId: t.id, liquidationStatus: "pending" } }),
    );
    console.log(t.slug, n);
  }
}
main();
