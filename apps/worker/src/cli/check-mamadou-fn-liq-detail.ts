import "../load-env.js";
import { withTenant, withoutTenant } from "@fleethub/db";

async function main() {
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug: "cosculluela" }, select: { id: true } }),
  );
  if (!tenant) return;

  const liq = await withTenant(tenant.id, (tx) =>
    tx.shiftLiquidation.findUnique({
      where: { id: "c39edf7d-9ba4-4971-bc29-e8303c6801f0" },
      select: { closedAt: true, platform: true, tripIds: true, periodFrom: true, periodTo: true, summary: true },
    }),
  );
  console.log("Liquidation:", liq);

  const ids = Array.isArray(liq?.tripIds) ? (liq!.tripIds as string[]) : [];
  const trips = await withTenant(tenant.id, (tx) =>
    tx.trip.findMany({
      where: { id: { in: ids } },
      orderBy: { startedAt: "asc" },
      select: { platform: true, startedAt: true, grossAmountCents: true, externalTripId: true },
    }),
  );
  for (const t of trips) {
    console.log(
      t.platform,
      t.startedAt.toLocaleString("es-ES", { timeZone: "Europe/Madrid" }),
      Number(t.grossAmountCents) / 100,
      t.externalTripId,
    );
  }
}

main().catch(console.error);
