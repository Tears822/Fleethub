import { isT3Fare, resolveTripFeeCents } from "@fleethub/auth/shift-liquidation";
import {
  resolveTripPaymentDisplayAmounts,
  tripGrossCents,
  tripNeedsManualPaymentReview,
} from "@fleethub/auth";
import { RidePlatform } from "@fleethub/db";

export type TripMoneyAgg = {
  count: number;
  grossCents: bigint;
  netCents: bigint;
  t3Cents: bigint;
  paymentAlertCount: number;
  tipCents: bigint;
  bonusCents: bigint;
  tollCents: bigint;
  appCents: bigint;
  cashCents: bigint;
  cardCents: bigint;
};

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
  cashPaymentCents?: bigint | null;
  cardPaymentCents?: bigint | null;
  appPaymentCents?: bigint | null;
  paymentValidated: boolean;
  driver: {
    id: string;
    fullName: string;
    isActive: boolean;
    company: { legalName: string };
  };
};

export type DriverTripGroup = {
  driver: { id: string; fullName: string; isActive: boolean };
  companyLegalName: string;
  platforms: Set<RidePlatform>;
  minDate: Date;
  maxDate: Date;
  money: TripMoneyAgg;
  byPlatform: Map<RidePlatform, TripMoneyAgg>;
};

function emptyAgg(): TripMoneyAgg {
  return {
    count: 0,
    grossCents: BigInt(0),
    netCents: BigInt(0),
    t3Cents: BigInt(0),
    paymentAlertCount: 0,
    tipCents: BigInt(0),
    bonusCents: BigInt(0),
    tollCents: BigInt(0),
    appCents: BigInt(0),
    cashCents: BigInt(0),
    cardCents: BigInt(0),
  };
}

function addTripToAgg(
  agg: TripMoneyAgg,
  trip: Pick<
    TripForAggregation,
    | "fareType"
    | "grossAmountCents"
    | "netAmountCents"
    | "tipCents"
    | "platformBonusCents"
    | "tollCents"
    | "paymentMethod"
    | "cashPaymentCents"
    | "cardPaymentCents"
    | "appPaymentCents"
    | "paymentValidated"
  >,
): void {
  const net = trip.netAmountCents ?? BigInt(0);
  const gross = tripGrossCents({
    grossAmountCents: trip.grossAmountCents,
    netAmountCents: trip.netAmountCents,
  });
  const tip = trip.tipCents ?? BigInt(0);
  const bonus = trip.platformBonusCents ?? BigInt(0);
  const toll = trip.tollCents ?? BigInt(0);

  agg.count += 1;
  agg.grossCents += gross;
  agg.netCents += net;
  agg.tipCents += tip;
  agg.bonusCents += bonus;
  agg.tollCents += toll;
  if (isT3Fare(trip.fareType)) {
    agg.t3Cents += gross;
  }
  if (tripNeedsManualPaymentReview(trip)) {
    agg.paymentAlertCount += 1;
  }

  const split = resolveTripPaymentDisplayAmounts(trip);
  agg.appCents += split.app;
  agg.cashCents += split.cash;
  agg.cardCents += split.card;
}

export function aggregateTripsByDriver(trips: TripForAggregation[]): DriverTripGroup[] {
  const byDriver = new Map<string, DriverTripGroup>();

  for (const trip of trips) {
    const tripEnd = trip.endedAt ?? trip.startedAt;
    let group = byDriver.get(trip.driver.id);
    if (!group) {
      group = {
        driver: trip.driver,
        companyLegalName: trip.driver.company.legalName,
        platforms: new Set(),
        minDate: trip.startedAt,
        maxDate: tripEnd,
        money: emptyAgg(),
        byPlatform: new Map(),
      };
      byDriver.set(trip.driver.id, group);
    }
    if (trip.startedAt < group.minDate) group.minDate = trip.startedAt;
    if (tripEnd > group.maxDate) group.maxDate = tripEnd;
    group.platforms.add(trip.platform);
    addTripToAgg(group.money, trip);
    let platAgg = group.byPlatform.get(trip.platform);
    if (!platAgg) {
      platAgg = emptyAgg();
      group.byPlatform.set(trip.platform, platAgg);
    }
    addTripToAgg(platAgg, trip);
  }

  return [...byDriver.values()];
}

export function platformLabel(p: RidePlatform): string {
  if (p === RidePlatform.FREENOW) return "FreeNow";
  if (p === RidePlatform.BOLT) return "Bolt";
  if (p === RidePlatform.CABIFY) return "Cabify";
  return "Uber";
}

export function platformSummaryLabel(platforms: Set<RidePlatform>): string {
  return [...platforms].map((p) => platformLabel(p)).join(" + ");
}

export function aggToEuroRow(agg: TripMoneyAgg): {
  viajes: number;
  importeTotal: number;
  tarifa3: number;
  pagoApp: number;
  efectivo: number;
  tarjetas: number;
  propinas: number;
  primas: number;
  peajes: number;
  avisos: number;
} {
  return {
    viajes: agg.count,
    importeTotal: Number(agg.grossCents) / 100,
    tarifa3: Number(agg.t3Cents) / 100,
    pagoApp: Number(agg.appCents) / 100,
    efectivo: Number(agg.cashCents) / 100,
    tarjetas: Number(agg.cardCents) / 100,
    propinas: Number(agg.tipCents) / 100,
    primas: Number(agg.bonusCents) / 100,
    peajes: Number(agg.tollCents) / 100,
    avisos: agg.paymentAlertCount,
  };
}
