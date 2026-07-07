/** Verify FreeNow billing vs FreeNow PDF reference (Pere Asensio, 01–05 Jul 2026). */
import "../load-env.js";
import { RidePlatform, withTenant, withoutTenant } from "@fleethub/db";

const TENANT = "cosculluela";
const DRIVER = "PERE ASENSIO";
const FROM = new Date("2026-07-01T00:00:00+02:00");
const TO = new Date("2026-07-05T23:59:59.999+02:00");

const tenant = await withoutTenant((tx) =>
  tx.tenant.findUnique({ where: { slug: TENANT }, select: { id: true, name: true } }),
);
if (!tenant) throw new Error("tenant not found");

const trips = await withTenant(tenant.id, (tx) =>
  tx.trip.findMany({
    where: {
      tenantId: tenant.id,
      platform: RidePlatform.FREENOW,
      liquidationStatus: "closed",
      startedAt: { gte: FROM, lte: TO },
      driver: { fullName: { contains: "ASENSIO", mode: "insensitive" } },
    },
    select: {
      grossAmountCents: true,
      platformFeeCents: true,
      tipCents: true,
      netAmountCents: true,
      appPaymentCents: true,
      startedAt: true,
    },
    orderBy: { startedAt: "asc" },
  }),
);

let gross = 0n;
let fee = 0n;
let tips = 0n;
for (const t of trips) {
  gross += t.grossAmountCents ?? 0n;
  fee += t.platformFeeCents ?? 0n;
  tips += t.tipCents ?? 0n;
}

const bruto = gross + tips;
const pct = bruto > 0n ? (Number(fee) / Number(bruto)) * 100 : 0;
const net = bruto - fee;

console.log(`\n=== Facturación check — ${DRIVER} (FreeNow, 01–05/07/2026) ===`);
console.log("Viajes (cerrados):", trips.length);
console.log("Facturación (bruto):", (Number(bruto) / 100).toFixed(2), "€");
console.log("Comisión:", (Number(fee) / 100).toFixed(2), "€", `(${pct.toFixed(1)}%)`);
console.log("Neto:", (Number(net) / 100).toFixed(2), "€");
console.log("Propinas (incl. en bruto):", (Number(tips) / 100).toFixed(2), "€");
console.log("\nReferencia PDF FreeNow:");
console.log("  Bruto: 282,25 € | Comisión: 42,42 € | Neto: 239,83 €");
console.log("\nPrimer viaje (Turnos cerrados):");
const first = trips[0];
if (first) {
  console.log(
    `  Bruto ${Number(first.grossAmountCents ?? 0n) / 100} € → Comisión ${Number(first.platformFeeCents ?? 0n) / 100} € (PDF: 1,73 €)`,
  );
}

const ok =
  trips.length === 25 &&
  Math.abs(Number(bruto) / 100 - 282.25) < 0.01 &&
  Math.abs(Number(fee) / 100 - 42.42) < 0.01 &&
  Math.abs(Number(net) / 100 - 239.83) < 0.01;
console.log(ok ? "\n✓ Alineado con liquidación FreeNow" : "\n✗ Revisar discrepancia");
await import("@fleethub/db").then((m) => m.prisma.$disconnect());
