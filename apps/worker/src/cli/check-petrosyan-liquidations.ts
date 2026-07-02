import "../load-env.js";
import { withTenant, withoutTenant } from "@fleethub/db";

async function main() {
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug: "cosculluela" }, select: { id: true } }),
  );
  if (!tenant) throw new Error("no tenant");

  const driver = await withTenant(tenant.id, (tx) =>
    tx.driver.findFirst({
      where: { fullName: { contains: "Petrosyan", mode: "insensitive" } },
      select: { id: true },
    }),
  );
  if (!driver) throw new Error("no driver");

  const shifts = await withTenant(tenant.id, (tx) =>
    tx.shiftLiquidation.findMany({
      where: {
        tenantId: tenant.id,
        driverId: driver.id,
        closedAt: { gte: new Date("2026-07-01T00:00:00Z") },
      },
      orderBy: { closedAt: "desc" },
      select: {
        id: true,
        closedAt: true,
        liquidationStatus: true,
        periodStart: true,
        periodEnd: true,
        _count: { select: { trips: true } },
      },
      take: 5,
    }),
  );

  console.log("Recent liquidations:", shifts);
}

main().catch(console.error);
