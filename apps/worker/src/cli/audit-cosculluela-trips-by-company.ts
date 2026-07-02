/**
 * Audit cosculluela: drivers vs trips by company + platform link quality.
 * Usage: npx tsx src/cli/run-with-worker-uber-env.ts src/cli/audit-cosculluela-trips-by-company.ts [days=30]
 */
import "../load-env.js";
import { RidePlatform, withoutTenant, withTenant } from "@fleethub/db";

const SLUG = "cosculluela";
const days = Math.max(1, Number(process.argv[2] ?? 30) || 30);

function isRealPlatformId(platform: RidePlatform, ext: string): boolean {
  const id = ext.trim();
  if (!id || id.startsWith("seed-") || id.startsWith("manual-")) return false;
  if (platform === RidePlatform.FREENOW) {
    return id.length >= 12 && /^[A-Z0-9]+$/i.test(id);
  }
  return /^[0-9a-f-]{36}$/i.test(id);
}

async function main() {
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug: SLUG }, select: { id: true } }),
  );
  if (!tenant) throw new Error("tenant not found");

  const since = new Date(Date.now() - days * 86400000);

  const companies = await withTenant(tenant.id, (tx) =>
    tx.company.findMany({
      where: { tenantId: tenant.id, isActive: true },
      select: { id: true, legalName: true, taxId: true },
      orderBy: { legalName: "asc" },
    }),
  );

  console.log(`=== ${SLUG} — drivers vs trips (${days}d) ===\n`);

  for (const co of companies) {
    const drivers = await withTenant(tenant.id, (tx) =>
      tx.driver.findMany({
        where: { tenantId: tenant.id, companyId: co.id, isActive: true },
        select: {
          id: true,
          fullName: true,
          driverPlatformAccounts: {
            where: { isActive: true },
            select: { platform: true, externalDriverId: true },
          },
        },
        orderBy: { fullName: "asc" },
      }),
    );

    if (drivers.length === 0) continue;

    let withTrips = 0;
    let linkedUber = 0;
    let linkedFn = 0;
    let weakLink = 0;
    const noTrips: string[] = [];

    for (const d of drivers) {
      const tripCount = await withTenant(tenant.id, (tx) =>
        tx.trip.count({
          where: { tenantId: tenant.id, driverId: d.id, startedAt: { gte: since } },
        }),
      );

      const uber = d.driverPlatformAccounts.find((a) => a.platform === RidePlatform.UBER);
      const fn = d.driverPlatformAccounts.find((a) => a.platform === RidePlatform.FREENOW);

      if (uber && isRealPlatformId(RidePlatform.UBER, uber.externalDriverId)) linkedUber += 1;
      else if (uber) weakLink += 1;

      if (fn && isRealPlatformId(RidePlatform.FREENOW, fn.externalDriverId)) linkedFn += 1;
      else if (fn) weakLink += 1;

      if (tripCount > 0) {
        withTrips += 1;
      } else if (d.driverPlatformAccounts.length > 0) {
        noTrips.push(d.fullName);
      }
    }

    console.log(`--- ${co.legalName} (${co.taxId ?? "?"}) ---`);
    console.log(
      `  drivers: ${drivers.length} | trips>${days}d: ${withTrips} | uber linked: ${linkedUber} | FN linked: ${linkedFn} | weak/missing ID: ${weakLink}`,
    );
    if (noTrips.length > 0 && noTrips.length <= 12) {
      console.log(`  platform account but 0 trips: ${noTrips.join("; ")}`);
    } else if (noTrips.length > 12) {
      console.log(`  platform account but 0 trips: ${noTrips.length} drivers (first 8: ${noTrips.slice(0, 8).join("; ")}…)`);
    }
    console.log("");
  }

  const pending = await withTenant(tenant.id, (tx) =>
    tx.trip.groupBy({
      by: ["driverId"],
      where: {
        tenantId: tenant.id,
        liquidationStatus: "PENDING",
        startedAt: { gte: since },
      },
      _count: { id: true },
    }),
  );

  const pendingDrivers = await withTenant(tenant.id, (tx) =>
    tx.driver.findMany({
      where: { id: { in: pending.map((p) => p.driverId) } },
      select: { fullName: true, company: { select: { legalName: true } } },
    }),
  );

  const byCo = new Map<string, number>();
  for (const d of pendingDrivers) {
    const k = d.company.legalName;
    byCo.set(k, (byCo.get(k) ?? 0) + 1);
  }

  console.log("=== Pending liquidation (Cerrar turnos) by company ===");
  for (const [name, n] of [...byCo.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${name}: ${n} driver(s)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
