import "../load-env.js";
import { withTenant, withoutTenant } from "@fleethub/db";

const FN_1660 = "af7afb04-5126-4cf2-af09-f12348f38705";
const DRIVER_ID = "757e7723-52f2-469f-8b88-58e83586c2dc";

async function main() {
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug: "cosculluela" }, select: { id: true } }),
  );
  if (!tenant) return;

  const liqs = await withTenant(tenant.id, (tx) =>
    tx.shiftLiquidation.findMany({
      where: { tenantId: tenant.id, driverId: DRIVER_ID },
      orderBy: { closedAt: "desc" },
      select: { id: true, closedAt: true, platform: true, tripIds: true, periodFrom: true, periodTo: true },
    }),
  );

  console.log("Liquidations:", liqs.length);
  for (const l of liqs) {
    const ids = Array.isArray(l.tripIds) ? (l.tripIds as string[]) : [];
    if (ids.includes(FN_1660)) {
      console.log("FOUND 16.60 in", l.id, l.platform, l.closedAt?.toISOString());
    }
  }

  const fnLiqs = liqs.filter((l) => l.platform === "FREENOW");
  console.log("\nFREENOW liquidations:", fnLiqs.length);
  for (const l of fnLiqs.slice(0, 5)) {
    const ids = Array.isArray(l.tripIds) ? (l.tripIds as string[]) : [];
    console.log(l.closedAt?.toISOString(), ids.length, "trips");
  }

  const trip = await withTenant(tenant.id, (tx) =>
    tx.trip.findUnique({
      where: { id: FN_1660 },
      select: { liquidationStatus: true, startedAt: true, grossAmountCents: true },
    }),
  );
  console.log("\nTrip state:", trip);
}

main().catch(console.error);
