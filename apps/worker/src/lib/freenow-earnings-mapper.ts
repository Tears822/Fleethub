import type { NormalizedTripUpsert } from "@fleethub/contracts";
import type { GetDriverEarningsResponse200 } from "@api/freenow";
import { freenowPaymentSplitCents } from "./freenow-booking-mapper.js";
import { getFreenowDriverEarnings } from "./freenow-client.js";

function eurosToCents(amount: number | undefined): bigint {
  if (amount == null || !Number.isFinite(amount)) return 0n;
  return BigInt(Math.round(Math.abs(amount) * 100));
}

export type FreenowEarningsTotals = {
  commissionCents: bigint;
  incentivesCents: bigint;
  totalBeforeCommissionCents: bigint;
  numberOfTours: number;
};

/** Aggregate commission / primas from driver or company earnings report. */
export function extractFreenowEarningsTotals(
  report: Pick<GetDriverEarningsResponse200, "grossValues"> | null | undefined,
): FreenowEarningsTotals {
  const gross = report?.grossValues;
  const commissionRaw = gross?.commission;
  const commissionCharged = gross?.commissionCharged;
  let commissionCents = eurosToCents(commissionRaw);
  if (commissionCents <= 0n) {
    commissionCents = eurosToCents(commissionCharged);
  }
  if (commissionCents <= 0n) {
    const before = eurosToCents(gross?.totalBeforeCommission);
    const after = eurosToCents(gross?.totalAfterCommission);
    if (before > after && after > 0n) {
      commissionCents = before - after;
    }
  }
  return {
    commissionCents,
    incentivesCents: eurosToCents(gross?.incentives),
    totalBeforeCommissionCents: eurosToCents(gross?.totalBeforeCommission),
    numberOfTours:
      typeof gross?.tours?.numberOfTours === "number" && Number.isFinite(gross.tours.numberOfTours)
        ? gross.tours.numberOfTours
        : 0,
  };
}

function allocateShare(
  total: bigint,
  weight: bigint,
  weightSum: bigint,
  remaining: bigint,
  isLast: boolean,
): bigint {
  if (total <= 0n || weightSum <= 0n) return 0n;
  if (isLast) return remaining > 0n ? remaining : 0n;
  const share = (total * weight) / weightSum;
  return share > remaining ? remaining : share;
}

function recomputeNetAndSplit(trip: NormalizedTripUpsert): NormalizedTripUpsert {
  const gross = trip.grossAmountCents ?? 0n;
  const fee = trip.platformFeeCents ?? 0n;
  const tip = trip.tipCents ?? 0n;
  const net = gross > fee + tip ? gross - fee - tip : gross > fee ? gross - fee : null;
  const split = freenowPaymentSplitCents(trip.paymentMethod ?? null, net);
  return {
    ...trip,
    netAmountCents: net,
    ...split,
  };
}

/**
 * Spread driver-period commission and incentives across trip upserts (proportional to gross).
 * Earnings API is aggregate-only — per-trip fee/prima is estimated from the period totals.
 */
export function applyFreenowDriverEarningsToTrips(
  trips: NormalizedTripUpsert[],
  totals: FreenowEarningsTotals,
): NormalizedTripUpsert[] {
  if (trips.length === 0) return trips;
  if (totals.commissionCents <= 0n && totals.incentivesCents <= 0n) {
    return trips;
  }

  const tripsNeedingFee = trips.filter((t) => !t.platformFeeCents || t.platformFeeCents <= 0n);
  const allocateCommission = totals.commissionCents > 0n && tripsNeedingFee.length > 0;
  const feeTargets = allocateCommission ? tripsNeedingFee : [];
  const feeWeights = feeTargets.map((t) => {
    const g = t.grossAmountCents ?? 0n;
    return g > 0n ? g : 0n;
  });
  const feeWeightSum = feeWeights.reduce((a, b) => a + b, 0n);
  const feeBasis =
    feeWeightSum > 0n
      ? feeWeightSum
      : totals.totalBeforeCommissionCents > 0n && feeTargets.length > 0
        ? BigInt(feeTargets.length)
        : 0n;

  const incentiveWeights = trips.map((t) => {
    const g = t.grossAmountCents ?? 0n;
    return g > 0n ? g : 0n;
  });
  const incentiveWeightSum = incentiveWeights.reduce((a, b) => a + b, 0n);
  const incentiveBasis =
    incentiveWeightSum > 0n
      ? incentiveWeightSum
      : totals.totalBeforeCommissionCents > 0n
        ? BigInt(trips.length)
        : 0n;

  let remainingCommission = totals.commissionCents;
  let remainingIncentives = totals.incentivesCents;
  let feeTargetIndex = 0;

  return trips.map((trip, index) => {
    let fee = trip.platformFeeCents ?? 0n;
    if (allocateCommission && (!trip.platformFeeCents || trip.platformFeeCents <= 0n)) {
      const targetIdx = feeTargetIndex;
      feeTargetIndex += 1;
      const isLastFee = targetIdx === feeTargets.length - 1;
      const weight =
        feeWeightSum > 0n
          ? feeWeights[targetIdx]!
          : totals.totalBeforeCommissionCents > 0n
            ? 1n
            : 0n;
      fee = allocateShare(
        totals.commissionCents,
        weight,
        feeBasis,
        remainingCommission,
        isLastFee,
      );
      remainingCommission -= fee;
    }

    const isLastIncentive = index === trips.length - 1;
    const incentiveWeight =
      incentiveWeightSum > 0n
        ? incentiveWeights[index]!
        : totals.totalBeforeCommissionCents > 0n
          ? 1n
          : 0n;
    const bonus = allocateShare(
      totals.incentivesCents,
      incentiveWeight,
      incentiveBasis,
      remainingIncentives,
      isLastIncentive,
    );
    remainingIncentives -= bonus;

    return recomputeNetAndSplit({
      ...trip,
      platformFeeCents: fee > 0n ? fee : trip.platformFeeCents,
      platformBonusCents: bonus > 0n ? bonus : trip.platformBonusCents,
    });
  });
}

export async function enrichFreenowTripsWithDriverEarnings(params: {
  publicCompanyId: string;
  publicDriverId: string;
  from: Date;
  to: Date;
  trips: NormalizedTripUpsert[];
}): Promise<{ trips: NormalizedTripUpsert[]; enriched: boolean; message?: string }> {
  if (params.trips.length === 0) {
    return { trips: params.trips, enriched: false };
  }

  const earnings = await getFreenowDriverEarnings({
    publicCompanyId: params.publicCompanyId,
    publicDriverId: params.publicDriverId,
    from: params.from,
    to: params.to,
  });

  if (!earnings.ok) {
    return {
      trips: params.trips,
      enriched: false,
      message: earnings.message,
    };
  }

  const totals = extractFreenowEarningsTotals(earnings.data);
  if (totals.commissionCents <= 0n && totals.incentivesCents <= 0n) {
    return {
      trips: params.trips,
      enriched: false,
      message:
        totals.numberOfTours === 0
          ? "driver earnings returned zero tours for this date range"
          : "driver earnings had no commission/incentives",
    };
  }

  return {
    trips: applyFreenowDriverEarningsToTrips(params.trips, totals),
    enriched: true,
  };
}
