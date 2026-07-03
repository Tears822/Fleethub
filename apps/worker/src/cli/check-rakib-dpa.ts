import "../load-env.js";
import { RidePlatform, withTenant, withoutTenant } from "@fleethub/db";

async function main() {
  const t = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug: "trevino" }, select: { id: true } }),
  );
  if (!t) return;

  const rakib = await withTenant(t.id, (tx) =>
    tx.driver.findFirst({
      where: { fullName: { contains: "Rakib", mode: "insensitive" } },
      include: { driverPlatformAccounts: true },
    }),
  );
  console.log("rakib", rakib?.fullName, "dpas:", rakib?.driverPlatformAccounts);

  const stats = await withTenant(t.id, (tx) =>
    tx.driverPlatformAccount.groupBy({
      by: ["isActive"],
      where: { platform: RidePlatform.UBER },
      _count: true,
    }),
  );
  console.log("uber dpa stats", stats);

  const rakibTrips = await withTenant(t.id, (tx) =>
    tx.trip.count({
      where: {
        driverId: rakib?.id,
        platform: RidePlatform.UBER,
      },
    }),
  );
  const recent = await withTenant(t.id, (tx) =>
    tx.trip.findMany({
      where: { driverId: rakib?.id, platform: RidePlatform.UBER },
      orderBy: { startedAt: "desc" },
      take: 3,
      select: { startedAt: true, grossAmountCents: true },
    }),
  );
  console.log("rakib uber trips:", rakibTrips, recent.map((r) => ({
    date: r.startedAt.toISOString().slice(0, 10),
    gross: Number(r.grossAmountCents ?? 0n) / 100,
  })));

  const tenantUber = await withTenant(t.id, (tx) =>
    tx.trip.count({ where: { platform: RidePlatform.UBER } }),
  );
  console.log("trevino total uber trips:", tenantUber);
}

main().catch(console.error);
