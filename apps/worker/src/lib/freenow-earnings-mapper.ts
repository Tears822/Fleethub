import type { NormalizedTripUpsert } from "@fleethub/contracts";
import type { GetDriverEarningsResponse200 } from "@api/freenow";
import {
  tenantCalendarDayKey,
  tenantDayEndFromIso,
  tenantDayStartFromIso,
} from "@fleethub/auth/display-timezone";
import {
  freenowTripCommissionEstimateWeight,
} from "@fleethub/auth";
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
  totalAfterCommissionCents: bigint;
  numberOfTours: number;
};

/** Aggregate commission / primas from driver or company earnings report. */
export function extractFreenowEarningsTotals(
  report: Pick<GetDriverEarningsResponse200, "grossValues"> | null | undefined,
): FreenowEarningsTotals {
  const gross = report?.grossValues;
  const before = eurosToCents(gross?.totalBeforeCommission);
  const after = eurosToCents(gross?.totalAfterCommission);

  let commissionCents = 0n;
  if (before > after && after >= 0n) {
    commissionCents = before - after;
  }
  if (commissionCents <= 0n) {
    commissionCents = eurosToCents(gross?.commission);
  }
  if (commissionCents <= 0n) {
    commissionCents = eurosToCents(gross?.commissionCharged);
  }

  return {
    commissionCents,
    incentivesCents: eurosToCents(gross?.incentives),
    totalBeforeCommissionCents: before,
    totalAfterCommissionCents: after,
    numberOfTours:
      typeof gross?.tours?.numberOfTours === "number" && Number.isFinite(gross.tours.numberOfTours)
        ? gross.tours.numberOfTours
        : 0,
  };
}

/** Group trips by Europe/Madrid calendar day (matches FreeNow portal day filters). */
export function groupFreenowTripsByCalendarDay(
  trips: NormalizedTripUpsert[],
): Map<string, NormalizedTripUpsert[]> {
  const byDay = new Map<string, NormalizedTripUpsert[]>();
  for (const trip of trips) {
    const key = tenantCalendarDayKey(new Date(trip.startedAt));
    const list = byDay.get(key) ?? [];
    list.push(trip);
    byDay.set(key, list);
  }
  return byDay;
}

function freenowBillingSum(trips: NormalizedTripUpsert[]): bigint {
  return trips.reduce((a, t) => a + freenowBillingWeight(t), 0n);
}

function freenowBillingWeight(trip: NormalizedTripUpsert): bigint {
  const gross = trip.grossAmountCents ?? 0n;
  const tip = trip.tipCents ?? 0n;
  const base = gross + tip;
  return base > 0n ? base : 0n;
}

function freenowPeriodMatchesTrips(
  trips: NormalizedTripUpsert[],
  totals: FreenowEarningsTotals,
): boolean {
  const billingSum = freenowBillingSum(trips);
  if (totals.numberOfTours > 0 && totals.numberOfTours !== trips.length) return false;
  if (totals.totalBeforeCommissionCents > 0n && billingSum !== totals.totalBeforeCommissionCents) {
    return false;
  }
  return true;
}

function recomputeNetAndSplit(trip: NormalizedTripUpsert): NormalizedTripUpsert {
  const net =
    (trip.grossAmountCents ?? 0n) + (trip.tipCents ?? 0n) > 0n
      ? (() => {
          const base = (trip.grossAmountCents ?? 0n) + (trip.tipCents ?? 0n);
          const fee = trip.platformFeeCents ?? 0n;
          const after = base - fee;
          return after >= 0n ? after : null;
        })()
      : null;
  const split = freenowPaymentSplitCents(trip.paymentMethod ?? null, net);
  return {
    ...trip,
    netAmountCents: net,
    ...split,
  };
}

/** Largest-remainder allocation so trip fees sum exactly to `poolCents`. */
function allocateProportionalCents(pool: bigint, weights: bigint[]): bigint[] {
  if (pool <= 0n || weights.length === 0) return weights.map(() => 0n);
  const weightSum = weights.reduce((a, b) => a + b, 0n);
  if (weightSum <= 0n) return weights.map(() => 0n);

  const shares = weights.map((weight) => (pool * weight) / weightSum);
  let assigned = shares.reduce((a, b) => a + b, 0n);
  let remainder = pool - assigned;
  if (remainder <= 0n) return shares;

  const ranked = weights
    .map((weight, index) => ({
      index,
      remainder: (pool * weight) % weightSum,
    }))
    .sort((a, b) => {
      if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1;
      return a.index - b.index;
    });

  const out = [...shares];
  let cursor = 0;
  while (remainder > 0n) {
    const pick = ranked[cursor % ranked.length]!;
    out[pick.index] = (out[pick.index] ?? 0n) + 1n;
    remainder -= 1n;
    cursor += 1;
  }
  return out;
}

function scaleEarningsToTripGross(
  totals: FreenowEarningsTotals,
  tripBillingBaseSum: bigint,
): Pick<FreenowEarningsTotals, "commissionCents" | "incentivesCents"> {
  if (
    totals.totalBeforeCommissionCents > 0n &&
    tripBillingBaseSum > 0n &&
    tripBillingBaseSum < totals.totalBeforeCommissionCents
  ) {
    const half = totals.totalBeforeCommissionCents / 2n;
    return {
      commissionCents:
        (totals.commissionCents * tripBillingBaseSum + half) /
        totals.totalBeforeCommissionCents,
      incentivesCents:
        (totals.incentivesCents * tripBillingBaseSum + half) /
        totals.totalBeforeCommissionCents,
    };
  }
  return {
    commissionCents: totals.commissionCents,
    incentivesCents: totals.incentivesCents,
  };
}

function freenowCommissionPoolForBillingBase(
  billingSum: bigint,
  totals: FreenowEarningsTotals,
): bigint {
  if (billingSum <= 0n) return 0n;

  if (totals.totalBeforeCommissionCents > 0n && totals.commissionCents > 0n) {
    return (
      (totals.commissionCents * billingSum + totals.totalBeforeCommissionCents / 2n) /
      totals.totalBeforeCommissionCents
    );
  }

  return (billingSum * 1500n + 5000n) / 10000n;
}

/**
 * Spread driver-period commission and incentives across trip upserts (proportional to billing base).
 * Earnings API is aggregate-only — per-trip fee/prima is estimated from the period totals.
 */
export function applyFreenowDriverEarningsToTrips(
  trips: NormalizedTripUpsert[],
  totals: FreenowEarningsTotals,
): NormalizedTripUpsert[] {
  if (trips.length === 0) return trips;
  if (totals.commissionCents <= 0n && totals.incentivesCents <= 0n) {
    return trips.map((t) => recomputeNetAndSplit({ ...t, platformBonusCents: 0n }));
  }

  const feeWeights = trips.map((t) => freenowTripCommissionEstimateWeight(t));
  const feeWeightSum = feeWeights.reduce((a, b) => a + b, 0n);
  const billingSum = trips.reduce((a, t) => a + freenowBillingWeight(t), 0n);
  const scaled = scaleEarningsToTripGross(totals, billingSum);
  const commissionPool = scaled.commissionCents;
  const incentivesPool = scaled.incentivesCents;

  const commissionShares =
    commissionPool > 0n && trips.length > 0
      ? allocateProportionalCents(
          commissionPool,
          feeWeightSum > 0n ? feeWeights : trips.map((t) => freenowBillingWeight(t)),
        )
      : trips.map(() => 0n);

  const incentiveWeights = trips.map((t) => freenowBillingWeight(t));
  const incentiveShares =
    incentivesPool > 0n && trips.length > 0
      ? allocateProportionalCents(incentivesPool, incentiveWeights)
      : trips.map(() => 0n);

  return trips.map((trip, index) =>
    recomputeNetAndSplit({
      ...trip,
      platformFeeCents:
        commissionShares[index]! > 0n ? commissionShares[index]! : trip.platformFeeCents ?? null,
      platformBonusCents: incentiveShares[index]!,
    }),
  );
}

/** Standard FreeNow fleet commission (~15%) when earnings API is unavailable. */
export const FREENOW_FALLBACK_COMMISSION_BPS = 1500;

/** Estimate per-trip commission when getDriverEarnings fails (403/timeout). */
export function estimateFreenowCommissionFallbackTrips(
  trips: NormalizedTripUpsert[],
): NormalizedTripUpsert[] {
  const estimateWeights = trips.map((t) => freenowTripCommissionEstimateWeight(t));
  const estimateSum = estimateWeights.reduce((a, b) => a + b, 0n);
  const billingSum = trips.reduce((a, t) => a + freenowBillingWeight(t), 0n);
  if (billingSum <= 0n) {
    return trips.map((t) => recomputeNetAndSplit({ ...t, platformBonusCents: 0n }));
  }
  const pool = freenowCommissionPoolForBillingBase(billingSum, {
    commissionCents: 0n,
    incentivesCents: 0n,
    totalBeforeCommissionCents: 0n,
    totalAfterCommissionCents: 0n,
    numberOfTours: 0,
  });
  const shares = allocateProportionalCents(
    pool,
    estimateSum > 0n ? estimateWeights : trips.map((t) => freenowBillingWeight(t)),
  );
  return trips.map((trip, index) =>
    recomputeNetAndSplit({
      ...trip,
      platformFeeCents: shares[index]! > 0n ? shares[index]! : null,
      platformBonusCents: 0n,
    }),
  );
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

  const periodEarnings = await getFreenowDriverEarnings({
    publicCompanyId: params.publicCompanyId,
    publicDriverId: params.publicDriverId,
    from: params.from,
    to: params.to,
  });

  if (periodEarnings.ok) {
    const periodTotals = extractFreenowEarningsTotals(periodEarnings.data);
    if (
      freenowPeriodMatchesTrips(params.trips, periodTotals) &&
      (periodTotals.commissionCents > 0n || periodTotals.incentivesCents > 0n)
    ) {
      return {
        trips: applyFreenowDriverEarningsToTrips(params.trips, periodTotals),
        enriched: true,
      };
    }
  }

  const byDay = groupFreenowTripsByCalendarDay(params.trips);
  const enrichedTrips: NormalizedTripUpsert[] = [];
  let enriched = false;
  const messages: string[] = [];

  for (const [dayKey, dayTrips] of [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const from = tenantDayStartFromIso(dayKey);
    const to = tenantDayEndFromIso(dayKey);

    const earnings = await getFreenowDriverEarnings({
      publicCompanyId: params.publicCompanyId,
      publicDriverId: params.publicDriverId,
      from,
      to,
    });

    if (!earnings.ok) {
      messages.push(`${dayKey}: ${earnings.message}`);
      enriched = true;
      enrichedTrips.push(...estimateFreenowCommissionFallbackTrips(dayTrips));
      await new Promise((r) => setTimeout(r, 400));
      continue;
    }

    const totals = extractFreenowEarningsTotals(earnings.data);
    if (totals.commissionCents <= 0n && totals.incentivesCents <= 0n) {
      enrichedTrips.push(
        ...dayTrips.map((t) => recomputeNetAndSplit({ ...t, platformBonusCents: 0n })),
      );
      await new Promise((r) => setTimeout(r, 250));
      continue;
    }

    enriched = true;
    enrichedTrips.push(...applyFreenowDriverEarningsToTrips(dayTrips, totals));
    await new Promise((r) => setTimeout(r, 250));
  }

  enrichedTrips.sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  return {
    trips: enrichedTrips,
    enriched,
    message: messages.length > 0 ? messages.join("; ") : undefined,
  };
}
