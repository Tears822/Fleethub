/**
 * Mirror dashboard KPI calculations for a tenant (debug / verify UI zeros).
 *
 * Usage:
 *   npm run inspect:dashboard-kpis -w @fleethub/worker -- demo-a
 */
import path from "node:path";
import { config } from "dotenv";
import { countPendingPaymentAlerts } from "@fleethub/auth";
import { prisma, withTenant } from "@fleethub/db";

config({ path: path.resolve(process.cwd(), "../../.env") });
config({ path: path.resolve(process.cwd(), ".env"), override: true });

const APP_PLATFORMS = ["UBER", "FREENOW"] as const;

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function tripGrossCents(trip: {
  grossAmountCents: bigint | null;
  netAmountCents: bigint | null;
}): bigint {
  const gross = trip.grossAmountCents;
  if (gross != null && gross > BigInt(0)) return gross;
  return trip.netAmountCents ?? BigInt(0);
}

function countDriversActiveToday(input: {
  shiftPeriodsToday: { driverId: string }[];
  tripDriverIdsToday: string[];
}): number {
  const ids = new Set<string>();
  for (const row of input.shiftPeriodsToday) ids.add(row.driverId);
  for (const driverId of input.tripDriverIdsToday) ids.add(driverId);
  return ids.size;
}

function computeTurnoAbiertoByDriver(
  pendingTrips: { driverId: string; startedAt: Date }[],
  liquidationsToday: { driverId: string; closedAt: Date }[],
): number {
  const lastCloseTodayByDriver = new Map<string, Date>();
  for (const liq of liquidationsToday) {
    const prev = lastCloseTodayByDriver.get(liq.driverId);
    if (!prev || liq.closedAt > prev) lastCloseTodayByDriver.set(liq.driverId, liq.closedAt);
  }
  const result = new Map<string, boolean>();
  for (const trip of pendingTrips) {
    const lastClose = lastCloseTodayByDriver.get(trip.driverId);
    const open = !lastClose || trip.startedAt > lastClose;
    if (open) result.set(trip.driverId, true);
    else if (!result.has(trip.driverId)) result.set(trip.driverId, false);
  }
  return [...result.values()].filter(Boolean).length;
}

async function main() {
  const slug = process.argv[2]?.trim();
  if (!slug) {
    console.error("Usage: inspect-dashboard-kpis <tenant-slug>");
    process.exit(1);
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, name: true, timezone: true },
  });
  if (!tenant) {
    console.error("Tenant not found:", slug);
    process.exit(1);
  }

  const today = new Date();
  const todayStart = startOfLocalDay(today);
  const todayEnd = endOfLocalDay(today);
  const since2h = new Date(Date.now() - 2 * 60 * 60 * 1000);

  const snapshot = await withTenant(tenant.id, async (tx) => {
    const [trips, pendingDrivers, pendingTrips, liquidationsToday, shiftsStartedToday, tripRange, recentTrips, dpas] =
      await Promise.all([
        tx.trip.findMany({
          where: {
            tenantId: tenant.id,
            startedAt: { gte: new Date(todayStart.getTime() - 13 * 86400000), lte: todayEnd },
          },
          select: {
            driverId: true,
            platform: true,
            startedAt: true,
            grossAmountCents: true,
            netAmountCents: true,
            liquidationStatus: true,
          },
        }),
        tx.trip.groupBy({
          by: ["driverId"],
          where: { tenantId: tenant.id, liquidationStatus: "pending" },
        }),
        tx.trip.findMany({
          where: { tenantId: tenant.id, liquidationStatus: "pending" },
          select: { driverId: true, startedAt: true },
        }),
        tx.shiftLiquidation.findMany({
          where: {
            tenantId: tenant.id,
            status: "active",
            closedAt: { gte: todayStart, lte: todayEnd },
          },
          select: { driverId: true, closedAt: true },
        }),
        tx.shiftLiquidation.findMany({
          where: {
            tenantId: tenant.id,
            status: "active",
            periodFrom: { gte: todayStart, lte: todayEnd },
          },
          select: { driverId: true, periodFrom: true },
        }),
        tx.trip.aggregate({
          where: { tenantId: tenant.id },
          _min: { startedAt: true },
          _max: { startedAt: true },
        }),
        tx.trip.findMany({
          where: {
            tenantId: tenant.id,
            platform: { in: [...APP_PLATFORMS] },
            startedAt: { gte: since2h },
          },
          select: { id: true },
        }),
        tx.driverPlatformAccount.findMany({
          where: {
            tenantId: tenant.id,
            isActive: true,
            platform: { in: [...APP_PLATFORMS] },
          },
          select: { metadata: true },
        }),
      ]);

    return {
      trips,
      pendingDrivers,
      pendingTrips,
      liquidationsToday,
      shiftsStartedToday,
      tripRange,
      recentTrips,
      dpas,
    };
  });

  const todayTrips = snapshot.trips.filter(
    (t) => t.startedAt >= todayStart && t.startedAt <= todayEnd,
  );
  const todayClosed = todayTrips.filter((t) => t.liquidationStatus === "closed");
  const todayClosedApp = todayClosed.filter((t) =>
    (APP_PLATFORMS as readonly string[]).includes(t.platform),
  );
  const dayGross = todayClosed.reduce((s, t) => s + tripGrossCents(t), BigInt(0));
  const activeDriversToday = countDriversActiveToday({
    shiftPeriodsToday: snapshot.shiftsStartedToday,
    tripDriverIdsToday: todayTrips.map((t) => t.driverId),
  });
  const openShiftCount = computeTurnoAbiertoByDriver(
    snapshot.pendingTrips,
    snapshot.liquidationsToday,
  );
  const avisos = await countPendingPaymentAlerts(tenant.id);

  const closedByDay = new Map<string, number>();
  for (const t of snapshot.trips.filter((x) => x.liquidationStatus === "closed")) {
    const key = t.startedAt.toISOString().slice(0, 10);
    closedByDay.set(key, (closedByDay.get(key) ?? 0) + 1);
  }
  const topClosedDays = [...closedByDay.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  console.log(`=== Dashboard KPIs (${tenant.name} / ${slug}) ===`);
  console.log("Server now:", today.toISOString());
  console.log("Local today:", todayStart.toISOString(), "→", todayEnd.toISOString());
  console.log("Tenant timezone:", tenant.timezone ?? "(default server local)");
  console.log("");
  console.log("KPI                          | Dashboard should show");
  console.log("-----------------------------|----------------------");
  console.log("Conductores activos hoy      |", activeDriversToday);
  console.log("Turnos activos ahora         |", openShiftCount);
  console.log("Conectados ahora             |", snapshot.recentTrips.length > 0 ? "(activity)" : 0);
  console.log("Facturación del día          |", Math.round(Number(dayGross) / 100), "€");
  console.log("Viajes realizados            |", todayClosedApp.length);
  console.log("Turnos pendientes            |", snapshot.pendingDrivers.length);
  console.log("Avisos                       |", avisos);
  console.log("");
  console.log("--- Detail ---");
  console.log("Trips started today (any):", todayTrips.length);
  console.log("Closed trips today:", todayClosed.length);
  console.log("Shift liquidations periodFrom today:", snapshot.shiftsStartedToday.length);
  console.log("Trips last 2h (conectados proxy):", snapshot.recentTrips.length);
  console.log("Driver platform accounts:", snapshot.dpas.length);
  console.log("Trip data range:", snapshot.tripRange._min.startedAt?.toISOString().slice(0, 10), "→", snapshot.tripRange._max.startedAt?.toISOString().slice(0, 10));
  if (topClosedDays.length > 0) {
    console.log("Top days with closed trips:");
    for (const [day, n] of topClosedDays) console.log(`  ${day}: ${n}`);
  }
  if (todayTrips.length === 0 && snapshot.tripRange._max.startedAt && snapshot.tripRange._max.startedAt < todayStart) {
    console.log("");
    console.log("Note: no trips on «today» — daily KPIs (facturación, viajes, conductores) will be 0.");
    console.log("Pending KPIs (turnos, avisos) still reflect all open work from prior days.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
