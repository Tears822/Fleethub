import "../load-env.js";
import { withTenant, withoutTenant } from "@fleethub/db";

async function main() {
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug: "cosculluela" }, select: { id: true } }),
  );
  if (!tenant) throw new Error("no tenant");

  const trips = await withTenant(tenant.id, (tx) =>
    tx.trip.findMany({
      where: {
        tenantId: tenant.id,
        driver: { fullName: { contains: "Petrosyan", mode: "insensitive" } },
        startedAt: { gte: new Date("2026-07-02T00:00:00Z"), lte: new Date("2026-07-02T23:59:59Z") },
      },
      orderBy: { startedAt: "asc" },
      select: {
        externalTripId: true,
        startedAt: true,
        endedAt: true,
        grossAmountCents: true,
        ingestSource: true,
        rawPayloadId: true,
      },
    }),
  );

  for (const t of trips) {
    console.log("\n", t.externalTripId, Number(t.grossAmountCents)/100, t.ingestSource);
    console.log(" started:", t.startedAt.toISOString());
    if (t.rawPayloadId) {
      const raw = await withTenant(tenant.id, (tx) =>
        tx.rawIngestPayload.findUnique({ where: { id: t.rawPayloadId! }, select: { payload: true } }),
      );
      if (raw?.payload) {
        const p = raw.payload as Record<string, unknown>;
        const keys = Object.keys(p).filter((k) => /time|hora|fecha|date/i.test(k));
        for (const k of keys) console.log(" ", k, ":", String(p[k]).slice(0, 80));
      }
    }
  }
}

main().catch(console.error);
