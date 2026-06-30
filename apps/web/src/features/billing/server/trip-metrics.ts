import "server-only";

import type { PlatformKey } from "@/features/shifts/lib/shift-platform";
import { isT3Fare, resolveTripFeeCents, tripTaximetroCents } from "@fleethub/auth/shift-liquidation";
import { isCollectiblePaymentTrip } from "@fleethub/auth/trip-payment-buckets";
import {
  resolveTripPaymentDisplayAmounts,
  tripGrossCents,
  tripNeedsManualPaymentReview,
} from "@fleethub/auth/trip-payment-amounts";
import { tenantCalendarDayKey } from "@fleethub/auth/display-timezone";
import {
  eurosFromCents,
  formatEuroFromCents,
  formatEuroSignedFromCents,
} from "@/shared/lib/format-euro";
import type { RidePlatform } from "@prisma/client";

export { eurosFromCents, formatEuroFromCents, formatEuroSignedFromCents };

export type { PlatformKey };

export type TripMoneyAgg = {
  count: number;
  grossCents: bigint;
  feeCents: bigint;
  netCents: bigint;
  /** Bruto acumulado en viajes con tarifa precio cerrado (T3). */
  t3Cents: bigint;
  /** Bruto acumulado en viajes taxímetro (excluye T3 y líneas solo propina). */
  taximetroCents: bigint;
  /** Viajes con tipo de pago sin confirmar (`paymentValidated = false`). */
  paymentAlertCount: number;
  tipCents: bigint;
  bonusCents: bigint;
  tollCents: bigint;
  appCents: bigint;
  cashCents: bigint;
  cardCents: bigint;
  platforms: Set<RidePlatform>;
  shiftDays: Set<string>;
  totalDurationMs: number;
};

export function emptyTripMoneyAgg(): TripMoneyAgg {
  return {
    count: 0,
    grossCents: BigInt(0),
    feeCents: BigInt(0),
    netCents: BigInt(0),
    t3Cents: BigInt(0),
    taximetroCents: BigInt(0),
    paymentAlertCount: 0,
    tipCents: BigInt(0),
    bonusCents: BigInt(0),
    tollCents: BigInt(0),
    appCents: BigInt(0),
    cashCents: BigInt(0),
    cardCents: BigInt(0),
    platforms: new Set(),
    shiftDays: new Set(),
    totalDurationMs: 0,
  };
}

export type AddTripToAggOptions = {
  /**
   * Si true, app/efectivo/tarjeta solo para viajes con `paymentValidated !== false`.
   * Por defecto se incluye el tipo de pago inferido (tabla y detalle cuadran con importe).
   */
  collectiblePaymentsOnly?: boolean;
};

export function addTripToAgg(
  agg: TripMoneyAgg,
  trip: {
    platform: RidePlatform;
    startedAt: Date;
    endedAt: Date | null;
    grossAmountCents: bigint | null;
    platformFeeCents: bigint | null;
    netAmountCents: bigint | null;
    tipCents: bigint | null;
    platformBonusCents?: bigint | null;
    tollCents: bigint | null;
    paymentMethod: string | null;
    cashPaymentCents?: bigint | null;
    cardPaymentCents?: bigint | null;
    appPaymentCents?: bigint | null;
    fareType?: string | null;
    paymentValidated?: boolean;
  },
  options?: AddTripToAggOptions,
): void {
  const net = trip.netAmountCents ?? BigInt(0);
  const gross = tripGrossCents({
    grossAmountCents: trip.grossAmountCents,
    netAmountCents: trip.netAmountCents,
  });
  const fee = resolveTripFeeCents(trip);
  const tip = trip.tipCents ?? BigInt(0);
  const bonus = trip.platformBonusCents ?? BigInt(0);
  const toll = trip.tollCents ?? BigInt(0);

  agg.count += 1;
  agg.grossCents += gross;
  agg.feeCents += fee;
  agg.netCents += net;
  agg.tipCents += tip;
  agg.bonusCents += bonus;
  agg.tollCents += toll;
  if (isT3Fare(trip.fareType ?? null)) {
    agg.t3Cents += gross;
  }
  agg.taximetroCents += tripTaximetroCents({
    fareType: trip.fareType ?? null,
    grossAmountCents: trip.grossAmountCents,
    netAmountCents: trip.netAmountCents,
    tipCents: trip.tipCents,
  });
  if (tripNeedsManualPaymentReview(trip)) {
    agg.paymentAlertCount += 1;
  }
  agg.platforms.add(trip.platform);

  const day = tenantCalendarDayKey(trip.startedAt);
  agg.shiftDays.add(day);

  const end = trip.endedAt ?? trip.startedAt;
  agg.totalDurationMs += Math.max(0, end.getTime() - trip.startedAt.getTime());

  const includePayment =
    !options?.collectiblePaymentsOnly || isCollectiblePaymentTrip(trip.paymentValidated);
  if (includePayment) {
    const split = resolveTripPaymentDisplayAmounts(trip);
    agg.appCents += split.app;
    agg.cashCents += split.cash;
    agg.cardCents += split.card;
  }
}

