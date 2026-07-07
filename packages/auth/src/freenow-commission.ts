/** FreeNow liquidation «Importe total trayecto» = fare + tip (PDF / earnings API). */
export function freenowTripBillingBaseCents(trip: {
  grossAmountCents?: bigint | null;
  tipCents?: bigint | null;
}): bigint {
  const gross = trip.grossAmountCents ?? 0n;
  const tip = trip.tipCents ?? 0n;
  return gross + tip;
}

/** Platform commission is ~15% of fare; tips are not part of the fee base (PDF line items). */
export function freenowTripCommissionBaseCents(trip: {
  grossAmountCents?: bigint | null;
  tipCents?: bigint | null;
}): bigint {
  void trip.tipCents;
  return trip.grossAmountCents ?? 0n;
}

/** Driver net after platform fee (matches FreeNow PDF «Total a abonar» per trip). */
export function freenowTripNetAfterFeeCents(trip: {
  grossAmountCents?: bigint | null;
  tipCents?: bigint | null;
  platformFeeCents?: bigint | null;
}): bigint | null {
  const base = freenowTripBillingBaseCents(trip);
  if (base <= 0n) return null;
  const fee = trip.platformFeeCents ?? 0n;
  const net = base - fee;
  return net >= 0n ? net : null;
}

/** Per-trip commission at 15% with half-up cent rounding (FreeNow invoice line items). */
export function freenowEstimateTripCommissionCents(commissionBaseCents: bigint): bigint {
  if (commissionBaseCents <= 0n) return 0n;
  return (commissionBaseCents * 1500n + 5000n) / 10000n;
}

/** Initial per-trip fee weight before spreading the earnings API period pool. */
export function freenowTripCommissionEstimateWeight(trip: {
  grossAmountCents?: bigint | null;
  tipCents?: bigint | null;
}): bigint {
  return freenowEstimateTripCommissionCents(freenowTripCommissionBaseCents(trip));
}
