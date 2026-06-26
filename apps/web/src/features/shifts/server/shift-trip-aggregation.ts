import type {
  ClosedShiftRow,
  PlatformKey,
  PlatformShiftMetrics,
} from "@/features/shifts/ui/cerrar-turnos-types";
import {
  isMultiPlatform,
  platformKeyFromSet,
  shiftPlatformDisplayName,
} from "@/features/shifts/lib/shift-platform";
import {
  addTripToAgg,
  emptyTripMoneyAgg,
  formatEuroFromCents,
  type TripMoneyAgg,
} from "@/features/billing/server/trip-metrics";
import { RidePlatform } from "@prisma/client";
import {
  formatDateTimeRangeInTenantTz,
  tenantCalendarDayKey,
  TENANT_DISPLAY_TIMEZONE,
} from "@/shared/lib/tenant-timezone";

export type TripForAggregation = {
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

export type DriverTripGroup = {
  driver: { id: string; fullName: string; isActive: boolean };
  tripIds: string[];
  tripIdsByPlatform: Map<RidePlatform, string[]>;
  platforms: Set<RidePlatform>;
  minDate: Date;
  maxDate: Date;
  money: TripMoneyAgg;
  byPlatform: Map<RidePlatform, TripMoneyAgg>;
};

export function formatDateRange(from: Date, to: Date): string {
  const fmt = new Intl.DateTimeFormat("es-ES", {
    timeZone: TENANT_DISPLAY_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const a = fmt.format(from);
  const b = fmt.format(to);
  return a === b ? a : `${a} – ${b}`;
}

export function formatDateTimeRange(from: Date, to: Date): string {
  return formatDateTimeRangeInTenantTz(from, to);
}

export function aggregateTripsByDriver(trips: TripForAggregation[]): DriverTripGroup[] {
  const byDriver = new Map<string, DriverTripGroup>();

  for (const trip of trips) {
    const tripEnd = trip.endedAt ?? trip.startedAt;
    let group = byDriver.get(trip.driver.id);
    if (!group) {
      group = {
        driver: trip.driver,
        tripIds: [],
        tripIdsByPlatform: new Map(),
        platforms: new Set(),
        minDate: trip.startedAt,
        maxDate: tripEnd,
        money: emptyTripMoneyAgg(),
        byPlatform: new Map(),
      };
      byDriver.set(trip.driver.id, group);
    }
    group.tripIds.push(trip.id);
    let platTripIds = group.tripIdsByPlatform.get(trip.platform);
    if (!platTripIds) {
      platTripIds = [];
      group.tripIdsByPlatform.set(trip.platform, platTripIds);
    }
    platTripIds.push(trip.id);
    group.platforms.add(trip.platform);
    if (trip.startedAt < group.minDate) group.minDate = trip.startedAt;
    if (tripEnd > group.maxDate) group.maxDate = tripEnd;
    addTripToAgg(group.money, trip);
    let platAgg = group.byPlatform.get(trip.platform);
    if (!platAgg) {
      platAgg = emptyTripMoneyAgg();
      group.byPlatform.set(trip.platform, platAgg);
    }
    addTripToAgg(platAgg, trip);
  }

  return [...byDriver.values()];
}

export function moneyToShiftColumns(m: TripMoneyAgg) {
  return {
    viajes: m.count,
    total: formatEuroFromCents(m.grossCents),
    taximetro: formatEuroFromCents(m.grossCents - m.t3Cents),
    t3: formatEuroFromCents(m.t3Cents),
    app: formatEuroFromCents(m.appCents),
    efectivo: formatEuroFromCents(m.cashCents),
    tarjetas: formatEuroFromCents(m.cardCents),
    propinas: formatEuroFromCents(m.tipCents),
    primas: formatEuroFromCents(m.bonusCents),
    peajes: formatEuroFromCents(m.tollCents),
    avisos: m.paymentAlertCount,
  };
}

export function buildPlatformDesglose(g: DriverTripGroup, plataformas: PlatformKey): PlatformShiftMetrics[] | undefined {
  if (!isMultiPlatform(plataformas)) return undefined;
  return [...g.byPlatform.entries()].map(([platform, stats]) => ({
    platform: shiftPlatformDisplayName(platform),
    ...moneyToShiftColumns(stats),
  }));
}

function tripIdsByPlatformRecord(
  map: Map<RidePlatform, string[]>,
): Partial<Record<RidePlatform, string[]>> {
  const out: Partial<Record<RidePlatform, string[]>> = {};
  for (const [platform, ids] of map.entries()) {
    if (ids.length > 0) out[platform] = ids;
  }
  return out;
}

export type ClosedShiftRowDraft = Omit<ClosedShiftRow, "liquidationKey" | "closedAt">;

export function mapGroupsToClosedShiftRows(groups: DriverTripGroup[]): ClosedShiftRowDraft[] {
  return groups.map((g) => ({
    ...mapGroupToShiftRow(g),
    conductor: g.driver.fullName,
    rango: formatDateTimeRange(g.minDate, g.maxDate),
    driverId: g.driver.id,
    tripIds: g.tripIds,
    periodStart: tenantCalendarDayKey(g.minDate),
    periodEnd: tenantCalendarDayKey(g.maxDate),
  }));
}

export function mapGroupToShiftRow(g: DriverTripGroup) {
  const plataformas = platformKeyFromSet(g.platforms);
  const cols = moneyToShiftColumns(g.money);
  const desglose = buildPlatformDesglose(g, plataformas);
  const singlePlatform = g.platforms.size === 1 ? [...g.platforms][0]! : null;
  const singleStats = singlePlatform ? g.byPlatform.get(singlePlatform) : null;

  return {
    plataformas,
    viajes: cols.viajes,
    total: cols.total,
    taximetro: cols.taximetro,
    t3: cols.t3,
    app: cols.app,
    efectivo: cols.efectivo,
    tarjetas: cols.tarjetas,
    propinas: cols.propinas,
    primas: cols.primas,
    peajes: cols.peajes,
    avisos: cols.avisos,
    desglose,
    tripIdsByPlatform: tripIdsByPlatformRecord(g.tripIdsByPlatform),
    ...(singleStats ? moneyToShiftColumns(singleStats) : {}),
  };
}
