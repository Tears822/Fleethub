import "../load-env.js";
import { RidePlatform, withTenant, withoutTenant } from "@fleethub/db";

async function main() {
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug: "cosculluela" }, select: { id: true } }),
  );
  if (!tenant) return;

  const driver = await withTenant(tenant.id, (tx) =>
    tx.driver.findFirst({
      where: { fullName: { equals: "SHAHID IMRAN GONDAL", mode: "insensitive" } },
      select: { id: true },
    }),
  );
  if (!driver) return;

  const trips = await withTenant(tenant.id, (tx) =>
    tx.trip.findMany({
      where: {
        tenantId: tenant.id,
        driverId: driver.id,
        platform: RidePlatform.UBER,
        startedAt: { gte: new Date("2026-06-29T00:00:00+02:00"), lte: new Date("2026-06-29T23:59:59+02:00") },
      },
      orderBy: { startedAt: "asc" },
      select: { startedAt: true, grossAmountCents: true, ingestSource: true, externalTripId: true },
    }),
  );
  for (const t of trips) {
    const ms = t.startedAt.getUTCMilliseconds();
    console.log(
      t.startedAt.toISOString(),
      ms,
      Number(t.grossAmountCents) / 100,
      t.ingestSource,
      t.externalTripId.slice(0, 8),
    );
  }
}

main().catch(console.error);
