/**
 * Simulate detail total row reconciliation (mapper logic) for a set of trips.
 */
import "../load-env.js";
import { withoutTenant, withTenantRls } from "@fleethub/db";
import {
  resolveTripPaymentDisplayAmounts,
  tripPaymentDisplayBalanced,
} from "@fleethub/auth/trip-payment-amounts";

async function main() {
  const slug = process.argv[2] ?? "trevino";
  const name = process.argv[3] ?? "Samer";
  const platform = (process.argv[4] ?? "UBER").toUpperCase();
  const days = Number(process.argv[5] ?? 60);

  const tenant = await withoutTenant((tx) =>
    tx.tenant.findFirst({ where: { slug }, select: { id: true, slug: true } }),
  );
  if (!tenant) throw new Error(`tenant ${slug} not found`);

  const driver = await withoutTenant((tx) =>
    tx.driver.findFirst({
      where: { tenantId: tenant.id, fullName: { contains: name, mode: "insensitive" } },
      select: { id: true, fullName: true },
    }),
  );
  if (!driver) throw new Error(`driver ${name} not found`);

  const trips = await withTenantRls(tenant.id, (tx) =>
    tx.trip.findMany({
      where: {
        tenantId: tenant.id,
        driverId: driver.id,
        platform: platform as "UBER" | "FREENOW",
        startedAt: { gte: new Date(Date.now() - days * 864e5) },
      },
      orderBy: { startedAt: "asc" },
      select: {
        startedAt: true,
        grossAmountCents: true,
        netAmountCents: true,
        paymentMethod: true,
        cashPaymentCents: true,
        cardPaymentCents: true,
        appPaymentCents: true,
        tipCents: true,
        paymentValidated: true,
      },
    }),
  );

  let importe = BigInt(0);
  let app = BigInt(0);
  let cash = BigInt(0);
  let card = BigInt(0);
  let netTotal = BigInt(0);
  let unbalanced = 0;

  for (const t of trips) {
    const gross = t.grossAmountCents ?? BigInt(0);
    const net = t.netAmountCents ?? BigInt(0);
    const ic = gross > BigInt(0) ? gross : net;
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
    netTotal += net;
    if (!tripPaymentDisplayBalanced(input)) unbalanced += 1;
  }

  const pay = app + cash + card;
  const diff = pay - importe;

  console.log("tenant", tenant.slug);
  console.log("driver", driver.fullName);
  console.log("platform", platform);
  console.log("trips", trips.length);
  console.log("Importe (bruto)", Number(importe) / 100);
  console.log("Pago app", Number(app) / 100);
  console.log("Efectivo", Number(cash) / 100);
  console.log("Tarjeta", Number(card) / 100);
  console.log("app+efectivo+tarjeta", Number(pay) / 100);
  console.log("Diferencia vs Importe", Number(diff) / 100);
  console.log("Total neto (columna Total)", Number(netTotal) / 100);
  console.log("unbalanced trips", unbalanced);
  console.log(
    diff === BigInt(0) && unbalanced === 0 ? "RESULT: OK — puede cerrar turno" : "RESULT: FAIL — revisar detalle",
  );
}

main();
