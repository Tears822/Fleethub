import { listSectorBenchmarkOptInTenantIds } from "./tenant-analytics-settings";
import { withoutTenant } from "@fleethub/db";
import { tenantDayEndFromCalendarDate, tenantDayStartFromCalendarDate } from "./display-timezone";
import { RidePlatform } from "@prisma/client";
import type { SectorDriverAverages, SectorPlatformFilter } from "./analytics-sector-types";

export type { SectorDriverAverages, SectorPlatformFilter } from "./analytics-sector-types";

type TripAgg = {
  count: number;
  grossCents: bigint;
  feeCents: bigint;
  netCents: bigint;
  tipCents: bigint;
  bonusCents: bigint;
  shiftDays: Set<string>;
  totalDurationMs: number;
};

function emptyAgg(): TripAgg {
  return {
    count: 0,
    grossCents: BigInt(0),
    feeCents: BigInt(0),
    netCents: BigInt(0),
    tipCents: BigInt(0),
    bonusCents: BigInt(0),
    shiftDays: new Set(),
    totalDurationMs: 0,
  };
}

function addTrip(
  agg: TripAgg,
  trip: {
    startedAt: Date;
    endedAt: Date | null;
    grossAmountCents: bigint | null;
    platformFeeCents: bigint | null;
    netAmountCents: bigint | null;
    tipCents: bigint | null;
    platformBonusCents?: bigint | null;
  },
): void {
  const net = trip.netAmountCents ?? BigInt(0);
  const gross = trip.grossAmountCents ?? net;
  agg.count += 1;
  agg.grossCents += gross;
  agg.feeCents += trip.platformFeeCents ?? BigInt(0);
  agg.netCents += net;
  agg.tipCents += trip.tipCents ?? BigInt(0);
  agg.bonusCents += trip.platformBonusCents ?? BigInt(0);
  agg.shiftDays.add(trip.startedAt.toISOString().slice(0, 10));
  const end = trip.endedAt ?? trip.startedAt;
  agg.totalDurationMs += Math.max(0, end.getTime() - trip.startedAt.getTime());
}

function metricsFromAgg(agg: TripAgg): Pick<
  SectorDriverAverages,
  "facturacion" | "comisiones" | "eurHora"
> {
  const facturacion = Math.round(Number(agg.grossCents) / 100);
  const comisiones = -Math.round(Number(agg.feeCents) / 100);
  const hours = Math.max(0.5, agg.totalDurationMs / 3_600_000);
  const eurHora = Math.round((facturacion / hours) * 100) / 100;
  return { facturacion, comisiones, eurHora };
}

function filterTripsByPlatform<T extends { platform: RidePlatform }>(
  trips: T[],
  platform: SectorPlatformFilter,
): T[] {
  if (platform === "all") return trips;
  const ride =
    platform === "uber"
      ? RidePlatform.UBER
      : platform === "freenow"
        ? RidePlatform.FREENOW
        : platform === "bolt"
          ? RidePlatform.BOLT
          : RidePlatform.CABIFY;
  return trips.filter((t) => t.platform === ride);
}

function parseSectorPlatform(raw?: string): SectorPlatformFilter {
  if (raw === "uber" || raw === "freenow" || raw === "bolt" || raw === "cabify") {
    return raw;
  }
  return "all";
}

/** Media por conductor en otros tenants con opt-in (para tabla y export). */
export async function getSectorDriverAveragesForPlatform(
  excludeTenantId: string,
  dateFrom: Date,
  dateTo: Date,
  options: {
    viewerOptedIn: boolean;
    platform?: string;
  },
): Promise<SectorDriverAverages | null> {
  if (!options.viewerOptedIn) return null;

  const platform = parseSectorPlatform(options.platform);
  const optedInIds = await listSectorBenchmarkOptInTenantIds();
  const allowedTenantIds = optedInIds.filter((id) => id !== excludeTenantId);
  if (allowedTenantIds.length === 0) return null;

  const rangeStart = tenantDayStartFromCalendarDate(dateFrom);
  const rangeEnd = tenantDayEndFromCalendarDate(dateTo);

  const trips = await withoutTenant((tx) =>
    tx.trip.findMany({
      where: {
        liquidationStatus: "closed",
        startedAt: { gte: rangeStart, lte: rangeEnd },
        tenantId: { in: allowedTenantIds },
      },
      select: {
        tenantId: true,
        platform: true,
        startedAt: true,
        endedAt: true,
        grossAmountCents: true,
        platformFeeCents: true,
        netAmountCents: true,
        tipCents: true,
        platformBonusCents: true,
        driverId: true,
      },
    }),
  );

  const scoped = filterTripsByPlatform(trips, platform);
  const byDriver = new Map<string, TripAgg>();
  for (const t of scoped) {
    if (!allowedTenantIds.includes(t.tenantId)) continue;
    let agg = byDriver.get(t.driverId);
    if (!agg) {
      agg = emptyAgg();
      byDriver.set(t.driverId, agg);
    }
    addTrip(agg, t);
  }

  if (byDriver.size === 0) return null;

  let fact = 0;
  let com = 0;
  let viajes = 0;
  let turnos = 0;
  let media = 0;
  let eur = 0;
  let prop = 0;
  let prim = 0;
  for (const agg of byDriver.values()) {
    const m = metricsFromAgg(agg);
    fact += m.facturacion;
    com += m.comisiones;
    viajes += agg.count;
    turnos += agg.shiftDays.size;
    media += agg.shiftDays.size > 0 ? Math.round(m.facturacion / agg.shiftDays.size) : m.facturacion;
    eur += m.eurHora;
    prop += Math.round(Number(agg.tipCents) / 100);
    prim += Math.round(Number(agg.bonusCents) / 100);
  }
  const n = byDriver.size;
  return {
    facturacion: Math.round(fact / n),
    comisiones: Math.round(com / n),
    viajes: Math.round(viajes / n),
    turnos: Math.round(turnos / n),
    mediaTurno: Math.round(media / n),
    eurHora: Math.round((eur / n) * 10) / 10,
    propinas: Math.round(prop / n),
    primas: Math.round(prim / n),
  };
}

export { parseSectorPlatform };
