/**
 * Compare Uber trip times vs taximeter receipts — find 1h offset pattern.
 */
import "../load-env.js";
import { RidePlatform, withTenant, withoutTenant } from "@fleethub/db";

async function main() {
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug: "cosculluela" }, select: { id: true } }),
  );
  if (!tenant) throw new Error("no tenant");

  const targets = [
    { label: "18.90€ 29/06 taxímetro ~05:19", cents: 1890n, day: "2026-06-29" },
    { label: "12.60€ 02/07 taxímetro ~05:34", cents: 1260n, day: "2026-07-02" },
  ];

  for (const target of targets) {
    const dayStart = new Date(`${target.day}T00:00:00+02:00`);
    const dayEnd = new Date(`${target.day}T23:59:59.999+02:00`);
    const trips = await withTenant(tenant.id, (tx) =>
      tx.trip.findMany({
        where: {
          tenantId: tenant.id,
          platform: RidePlatform.UBER,
          grossAmountCents: target.cents,
          startedAt: { gte: dayStart, lte: dayEnd },
        },
        select: {
          startedAt: true,
          externalTripId: true,
          driver: { select: { fullName: true, company: { select: { legalName: true } } } },
        },
      }),
    );
    console.log(`\n=== ${target.label} ===`);
    for (const t of trips) {
      console.log(
        t.driver.fullName,
        "|",
        t.driver.company.legalName,
        "|",
        t.startedAt.toLocaleString("es-ES", { timeZone: "Europe/Madrid" }),
        "|",
        t.externalTripId.slice(0, 8) + "…",
      );
    }
    if (trips.length === 0) console.log("  (no match)");
  }

  const petro = await withTenant(tenant.id, (tx) =>
    tx.driver.findFirst({
      where: { fullName: { contains: "Petrosyan", mode: "insensitive" } },
      select: { id: true, fullName: true },
    }),
  );
  if (!petro) return;

  console.log(`\n=== ${petro.fullName} — all Uber trips (Jun 26 – Jul 2) ===`);
  const trips = await withTenant(tenant.id, (tx) =>
    tx.trip.findMany({
      where: {
        tenantId: tenant.id,
        driverId: petro.id,
        platform: RidePlatform.UBER,
        startedAt: { gte: new Date("2026-06-26T00:00:00+02:00"), lte: new Date("2026-07-02T23:59:59+02:00") },
      },
      orderBy: { startedAt: "asc" },
      select: { startedAt: true, grossAmountCents: true },
    }),
  );

  let prev: Date | null = null;
  for (const t of trips) {
    const madrid = t.startedAt.toLocaleString("es-ES", {
      timeZone: "Europe/Madrid",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    const gapMin = prev ? Math.round((t.startedAt.getTime() - prev.getTime()) / 60000) : null;
    const gap = gapMin != null && gapMin > 45 ? ` ⚠ gap ${gapMin}min` : "";
    console.log(`${madrid}  ${(Number(t.grossAmountCents) / 100).toFixed(2)}€${gap}`);
    prev = t.startedAt;
  }

  const total = trips.reduce((s, t) => s + Number(t.grossAmountCents), 0) / 100;
  console.log(`Total: ${total.toFixed(2)}€ (${trips.length} trips)`);

  const shahid = await withTenant(tenant.id, (tx) =>
    tx.driver.findFirst({
      where: { fullName: { contains: "SHAHID", mode: "insensitive" } },
      select: { id: true, fullName: true },
    }),
  );
  if (!shahid) return;

  console.log(`\n=== ${shahid.fullName} — Uber trips (screenshot ~129€) ===`);
  const sTrips = await withTenant(tenant.id, (tx) =>
    tx.trip.findMany({
      where: {
        tenantId: tenant.id,
        driverId: shahid.id,
        platform: RidePlatform.UBER,
        startedAt: { gte: new Date("2026-06-26T00:00:00+02:00"), lte: new Date("2026-07-02T23:59:59+02:00") },
      },
      orderBy: { startedAt: "asc" },
      select: { startedAt: true, grossAmountCents: true },
    }),
  );
  let sTotal = 0;
  let prevS: Date | null = null;
  for (const t of sTrips) {
    const madrid = t.startedAt.toLocaleString("es-ES", {
      timeZone: "Europe/Madrid",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    const g = Number(t.grossAmountCents) / 100;
    sTotal += g;
    const gapMin = prevS ? Math.round((t.startedAt.getTime() - prevS.getTime()) / 60000) : null;
    const gap = gapMin != null && gapMin > 45 ? ` ⚠ gap ${gapMin}min` : "";
    console.log(`${madrid}  ${g.toFixed(2)}€${gap}`);
    prevS = t.startedAt;
  }
  console.log(`Total: ${sTotal.toFixed(2)}€ (${sTrips.length} trips)`);
}

main().catch(console.error);
