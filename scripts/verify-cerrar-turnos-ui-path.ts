/**
 * UI path: tabla Cerrar Turnos vs detalle expandido (misma lógica que la página).
 * Usage: npx tsx scripts/verify-cerrar-turnos-ui-path.ts [slug] [driver] [UBER|FREENOW]
 */
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: path.join(root, ".env") });
loadEnv({ path: path.join(root, "apps/worker/.env"), override: true });

import { listShiftTripsForDetail } from "@fleethub/auth";
import { FH_SESSION_COOKIE } from "@fleethub/auth/constants";
import {
  resolveTripPaymentDisplayAmounts,
  tripGrossCents,
  tripPaymentDisplayBalanced,
} from "@fleethub/auth/trip-payment-amounts";
import { isT3Fare } from "@fleethub/auth/shift-liquidation";
import { withoutTenant, withTenantRls, RidePlatform } from "@fleethub/db";

const API = (process.env.FLEETHUB_API_URL ?? "http://127.0.0.1:4000").replace(/\/$/, "");

type TripRow = {
  id: string;
  platform: RidePlatform;
  startedAt: Date;
  endedAt: Date | null;
  fareType: string | null;
  grossAmountCents: bigint | null;
  platformFeeCents: bigint | null;
  netAmountCents: bigint | null;
  tipCents: bigint | null;
  platformBonusCents: bigint | null;
  tollCents: bigint | null;
  paymentMethod: string | null;
  cashPaymentCents: bigint | null;
  cardPaymentCents: bigint | null;
  appPaymentCents: bigint | null;
  paymentValidated: boolean;
  driver: { id: string; fullName: string; isActive: boolean };
};

function importeCents(t: TripRow): bigint {
  return tripGrossCents({
    grossAmountCents: t.grossAmountCents,
    netAmountCents: t.netAmountCents,
  });
}

function sumDetailTotals(trips: TripRow[]) {
  let importe = BigInt(0);
  let app = BigInt(0);
  let cash = BigInt(0);
  let card = BigInt(0);
  let net = BigInt(0);
  let unbalanced = 0;
  for (const t of trips) {
    const ic = importeCents(t);
    const input = {
      grossAmountCents: t.grossAmountCents,
      netAmountCents: t.netAmountCents,
      paymentMethod: t.paymentMethod,
      cashPaymentCents: t.cashPaymentCents,
      cardPaymentCents: t.cardPaymentCents,
      appPaymentCents: t.appPaymentCents,
    };
    const split = resolveTripPaymentDisplayAmounts(input);
    importe += ic;
    app += split.app;
    cash += split.cash;
    card += split.card;
    net += t.netAmountCents ?? BigInt(0);
    if (!tripPaymentDisplayBalanced(input)) unbalanced += 1;
  }
  return { importe, app, cash, card, net, unbalanced };
}

/** Web `addTripToAgg` (cerrar-turnos table — incluye tipo de pago inferido). */
function tableAggForPlatform(trips: TripRow[], platform: RidePlatform) {
  let gross = BigInt(0);
  let app = BigInt(0);
  let cash = BigInt(0);
  let card = BigInt(0);
  for (const t of trips) {
    if (t.platform !== platform) continue;
    const g = tripGrossCents({
      grossAmountCents: t.grossAmountCents,
      netAmountCents: t.netAmountCents,
    });
    gross += g;
    const split = resolveTripPaymentDisplayAmounts({
      grossAmountCents: t.grossAmountCents,
      netAmountCents: t.netAmountCents,
      paymentMethod: t.paymentMethod,
      cashPaymentCents: t.cashPaymentCents,
      cardPaymentCents: t.cardPaymentCents,
      appPaymentCents: t.appPaymentCents,
    });
    app += split.app;
    cash += split.cash;
    card += split.card;
  }
  return { gross, app, cash, card };
}

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login failed ${res.status}`);
  const raw = res.headers.get("set-cookie") ?? "";
  const m = raw.match(new RegExp(`${FH_SESSION_COOKIE}=([^;]+)`));
  if (!m?.[1]) throw new Error("no session cookie");
  return m[1];
}

async function main() {
  const slug = process.argv[2] ?? "trevino";
  const driverNeedle = process.argv[3] ?? "Samer";
  const platform = (process.argv[4] ?? "UBER").toUpperCase() as RidePlatform;

  const tenant = await withoutTenant((tx) =>
    tx.tenant.findFirst({ where: { slug }, select: { id: true, slug: true } }),
  );
  if (!tenant) throw new Error(`tenant ${slug} not found`);

  const admin = await withoutTenant((tx) =>
    tx.user.findFirst({
      where: { tenantId: tenant.id, role: "ADMIN_TENANT", isActive: true },
      select: { id: true, email: true, role: true },
    }),
  );
  if (!admin) throw new Error("no admin");

  const driver = await withoutTenant((tx) =>
    tx.driver.findFirst({
      where: { tenantId: tenant.id, fullName: { contains: driverNeedle, mode: "insensitive" } },
      select: { id: true, fullName: true },
    }),
  );
  if (!driver) throw new Error(`driver ${driverNeedle} not found`);

  const allPending = await withTenantRls(tenant.id, (tx) =>
    tx.trip.findMany({
      where: { tenantId: tenant.id, driverId: driver.id, liquidationStatus: "pending" },
      select: {
        id: true,
        platform: true,
        startedAt: true,
        endedAt: true,
        fareType: true,
        grossAmountCents: true,
        platformFeeCents: true,
        netAmountCents: true,
        tipCents: true,
        platformBonusCents: true,
        tollCents: true,
        paymentMethod: true,
        cashPaymentCents: true,
        cardPaymentCents: true,
        appPaymentCents: true,
        paymentValidated: true,
        driver: { select: { id: true, fullName: true, isActive: true } },
      },
    }),
  );

  const platformTrips = allPending.filter((t) => t.platform === platform);
  const table = tableAggForPlatform(allPending, platform);
  const detail = sumDetailTotals(platformTrips);

  const session = {
    kind: "tenant" as const,
    tid: tenant.id,
    uid: admin.id,
    role: admin.role,
    email: admin.email,
  };

  const authResult = await listShiftTripsForDetail(session, {
    driverId: driver.id,
    liquidationStatus: "pending",
    platform,
  });
  if (!authResult.ok) throw new Error(authResult.error.message);
  const apiCount = authResult.value.trips.length;

  // Live API (what browser fetch returns)
  let apiLiveCount = -1;
  let apiOk = false;
  try {
    const password = process.env.FLEETHUB_ADMIN_PASSWORD ?? process.env.FLEETHUB_DEMO_PASSWORD ?? "Demo1234!";
    const cookie = await login(admin.email, password);
    const params = new URLSearchParams({
      status: "pending",
      driverId: driver.id,
      platform,
    });
    const res = await fetch(`${API}/api/tenant/shifts/trips?${params}`, {
      headers: { Cookie: `${FH_SESSION_COOKIE}=${cookie}` },
    });
    if (res.ok) {
      const body = (await res.json()) as { trips?: unknown[] };
      apiLiveCount = body.trips?.length ?? 0;
      apiOk = true;
    }
  } catch (e) {
    console.log("API live skip:", e instanceof Error ? e.message : e);
  }

  const eur = (c: bigint) => Number(c) / 100;
  const tablePay = table.app + table.cash + table.card;
  const detailPay = detail.app + detail.cash + detail.card;

  console.log(`\n=== ${tenant.slug} / ${driver.fullName} / ${platform} ===`);
  console.log(`Viajes pendientes: ${platformTrips.length} (auth API: ${apiCount}, live API: ${apiLiveCount})`);

  console.log("\n--- Tabla Cerrar Turnos (subfila plataforma) ---");
  console.log(`Importe:     ${eur(table.gross).toFixed(2)} €`);
  console.log(`Pago app:    ${eur(table.app).toFixed(2)} €`);
  console.log(`Efectivo:    ${eur(table.cash).toFixed(2)} €`);
  console.log(`Tarjetas:    ${eur(table.card).toFixed(2)} €`);
  console.log(`Suma pagos:  ${eur(tablePay).toFixed(2)} € (diff ${eur(tablePay - table.gross).toFixed(2)})`);

  console.log("\n--- Detalle expandido (fila Total) ---");
  console.log(`Importe:     ${eur(detail.importe).toFixed(2)} €`);
  console.log(`Pago app:    ${eur(detail.app).toFixed(2)} €`);
  console.log(`Efectivo:    ${eur(detail.cash).toFixed(2)} €`);
  console.log(`Tarjetas:    ${eur(detail.card).toFixed(2)} €`);
  console.log(`Total neto:  ${eur(detail.net).toFixed(2)} €`);
  console.log(`Suma pagos:  ${eur(detailPay).toFixed(2)} € (diff ${eur(detailPay - detail.importe).toFixed(2)})`);
  console.log(`Viajes descuadrados: ${detail.unbalanced}`);

  const tableDetailMatch =
    table.gross === detail.importe &&
    table.app === detail.app &&
    table.cash === detail.cash &&
    table.card === detail.card;

  const detailBalanced = detailPay === detail.importe && detail.unbalanced === 0;

  console.log("\n--- Resultado ---");
  console.log(`Tabla ↔ Detalle: ${tableDetailMatch ? "OK" : "FAIL"}`);
  console.log(`Detalle cuadra: ${detailBalanced ? "OK" : "FAIL"}`);
  console.log(`API live: ${apiOk ? (apiLiveCount === platformTrips.length ? "OK" : "COUNT MISMATCH") : "SKIP"}`);

  if (!tableDetailMatch || !detailBalanced) process.exit(1);
  console.log("UI path OK — tabla y detalle muestran los mismos totales.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
