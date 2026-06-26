import "../load-env.js";
import { withoutTenant } from "@fleethub/db";

async function main() {
  const tenants = await withoutTenant((tx) =>
    tx.tenant.findMany({
      where: { slug: { in: ["trevino", "trade-taxi-sl", "cosculluela"] } },
      select: { id: true, slug: true },
    }),
  );
  for (const t of tenants) {
    const total = await withoutTenant((tx) => tx.trip.count({ where: { tenantId: t.id } }));
    const latest = await withoutTenant((tx) =>
      tx.trip.findFirst({
        where: { tenantId: t.id },
        orderBy: { startedAt: "desc" },
        select: { startedAt: true, platform: true },
      }),
    );
    console.log(t.slug, "total trips", total, "latest", latest?.startedAt?.toISOString());
  }
}
main();
