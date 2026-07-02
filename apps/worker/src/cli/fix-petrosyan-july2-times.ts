/**
 * Fix Petrosyan 02/07: correct 1h timezone offset + reopen 12.60€ trip to pending.
 */
import "../load-env.js";
import { withTenant, withoutTenant } from "@fleethub/db";

const TRIP_IDS = [
  "5e54915a-3a67-44f4-a6d6-f5bb737c76da",
  "16fed175-e652-4261-9dcf-bf1a62d7f5c8",
  "20f47ed2-3461-443d-9afe-ebdb5ee743e0",
];
const TRIP_1260 = "20f47ed2-3461-443d-9afe-ebdb5ee743e0";
const HOUR_MS = 3_600_000;

async function main() {
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug: "cosculluela" }, select: { id: true } }),
  );
  if (!tenant) throw new Error("no tenant");

  for (const externalTripId of TRIP_IDS) {
    const trip = await withTenant(tenant.id, (tx) =>
      tx.trip.findFirst({
        where: { tenantId: tenant.id, externalTripId },
        select: { id: true, startedAt: true, endedAt: true, grossAmountCents: true, liquidationStatus: true },
      }),
    );
    if (!trip) {
      console.log("skip", externalTripId.slice(0, 8), "not found");
      continue;
    }

    const startedAt = new Date(trip.startedAt.getTime() - HOUR_MS);
    const endedAt = trip.endedAt ? new Date(trip.endedAt.getTime() - HOUR_MS) : startedAt;
    const reopen = externalTripId === TRIP_1260;

    await withTenant(tenant.id, (tx) =>
      tx.trip.update({
        where: { id: trip.id },
        data: {
          startedAt,
          endedAt,
          ...(reopen ? { liquidationStatus: "pending" } : {}),
        },
      }),
    );

    const madrid = startedAt.toLocaleString("es-ES", { timeZone: "Europe/Madrid" });
    console.log(
      `fixed ${externalTripId.slice(0, 8)}… → ${madrid} | ${Number(trip.grossAmountCents) / 100}€ | status ${reopen ? "pending" : trip.liquidationStatus}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
