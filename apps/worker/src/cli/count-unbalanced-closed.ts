import "../load-env.js";
import { withTenant, withoutTenant } from "@fleethub/db";
import { tripPaymentUnbalanced, tripNeedsPaymentUiAttention } from "@fleethub/auth/trip-payment-amounts";

async function main() {
  const slug = process.argv[2] ?? "cosculluela";
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug }, select: { id: true } }),
  );
  if (!tenant) return;

  const trips = await withTenant(tenant.id, (tx) =>
    tx.trip.findMany({
      where: { tenantId: tenant.id, liquidationStatus: "closed" },
      select: {
        paymentValidated: true,
        grossAmountCents: true,
        netAmountCents: true,
        paymentMethod: true,
        cashPaymentCents: true,
        cardPaymentCents: true,
        appPaymentCents: true,
        driver: { select: { fullName: true } },
      },
    }),
  );

  const unbal = trips.filter((t) => tripPaymentUnbalanced(t));
  const pending = trips.filter((t) => tripNeedsPaymentUiAttention(t));
  const byDriver = new Map<string, number>();
  for (const t of unbal) {
    const n = t.driver.fullName;
    byDriver.set(n, (byDriver.get(n) ?? 0) + 1);
  }

  console.log(JSON.stringify({
    closed: trips.length,
    desquadratHistorico: unbal.length,
    pendientesCerrarTurnos: pending.filter(t => t.paymentValidated === false).length,
    top: [...byDriver.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
  }, null, 2));
}

main().catch(console.error);
