/**
 * Inspect AVISOS count (pending trips with paymentValidated = false).
 *
 * Usage:
 *   npm run inspect:payment-alerts -w @fleethub/worker -- demo-a
 */
import path from "node:path";
import { config } from "dotenv";
import { countPendingPaymentAlerts } from "@fleethub/auth";
import { prisma, withTenant } from "@fleethub/db";

config({ path: path.resolve(process.cwd(), "../../.env") });
config({ path: path.resolve(process.cwd(), ".env"), override: true });

async function main() {
  const slug = process.argv[2]?.trim();
  if (!slug) {
    console.error("Usage: inspect-payment-alerts <tenant-slug>");
    process.exit(1);
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });
  if (!tenant) {
    console.error("Tenant not found:", slug);
    process.exit(1);
  }

  const dashboardCount = await countPendingPaymentAlerts(tenant.id);

  const breakdown = await withTenant(tenant.id, (tx) =>
    Promise.all([
      tx.trip.count({ where: { tenantId: tenant.id, liquidationStatus: "pending" } }),
      tx.trip.groupBy({
        by: ["platform"],
        where: {
          tenantId: tenant.id,
          liquidationStatus: "pending",
          paymentValidated: false,
        },
        _count: { _all: true },
      }),
      tx.trip.groupBy({
        by: ["paymentMethod"],
        where: {
          tenantId: tenant.id,
          liquidationStatus: "pending",
          paymentValidated: false,
        },
        _count: { _all: true },
      }),
      tx.trip.groupBy({
        by: ["driverId"],
        where: { tenantId: tenant.id, liquidationStatus: "pending" },
        _count: { _all: true },
      }),
    ]),
  );

  const [pendingTotal, byPlatform, byPayment, pendingDrivers] = breakdown;

  console.log(`=== Payment alerts (${tenant.name} / ${slug}) ===`);
  console.log("Dashboard AVISOS should show:", dashboardCount);
  console.log("Pending trips total:", pendingTotal);
  console.log("Pending drivers (Cerrar turnos rows):", pendingDrivers.length);
  console.log("Unvalidated by platform:", byPlatform);
  console.log("Unvalidated by paymentMethod:", byPayment);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
