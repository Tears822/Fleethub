import "../load-env.js";
import { withoutTenant } from "@fleethub/db";

async function main() {
  const slug = process.argv[2];
  const tenants = slug
    ? await withoutTenant((tx) =>
        tx.tenant.findMany({ where: { slug }, select: { id: true, slug: true } }),
      )
    : await withoutTenant((tx) =>
        tx.tenant.findMany({
          where: { commercialStatus: "ACTIVE" },
          select: { id: true, slug: true },
        }),
      );

  for (const tenant of tenants) {
    const zeroGross = await withoutTenant((tx) =>
      tx.trip.count({
        where: {
          tenantId: tenant.id,
          grossAmountCents: 0,
          netAmountCents: { gt: 0 },
          startedAt: { gte: new Date(Date.now() - 30 * 864e5) },
        },
      }),
    );
    const nullGross = await withoutTenant((tx) =>
      tx.trip.count({
        where: {
          tenantId: tenant.id,
          grossAmountCents: null,
          netAmountCents: { gt: 0 },
          startedAt: { gte: new Date(Date.now() - 30 * 864e5) },
        },
      }),
    );
  const unvalidatedCash = await withoutTenant((tx) =>
      tx.trip.count({
        where: {
          tenantId: tenant.id,
          paymentValidated: false,
          startedAt: { gte: new Date(Date.now() - 30 * 864e5) },
          OR: [
            { paymentMethod: { contains: "cash", mode: "insensitive" } },
            { cashPaymentCents: { gt: 0 } },
          ],
        },
      }),
    );
    if (zeroGross || nullGross || unvalidatedCash) {
      console.log(tenant.slug, { zeroGross, nullGross, unvalidatedCash });
    }
  }
}
main();
