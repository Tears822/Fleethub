import type { NormalizedTripUpsert } from "@fleethub/contracts";
import { mapFreenowFareType } from "./freenow-fare-type.js";
import type { FreenowBooking } from "./freenow-sdk.js";

function eurosToCents(amount: number | undefined): bigint | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  return BigInt(Math.round(Math.abs(amount) * 100));
}

function mapPaymentMethod(raw: string | undefined): string | null {
  if (!raw) return null;
  const upper = raw.trim().toUpperCase();
  if (upper === "APP") return "app";
  if (upper === "CASH") return "cash";
  return raw.toLowerCase();
}

/**
 * Legacy helper — `tourValue.taxPercentage` is VAT (e.g. 10%), not platform commission (~15%).
 * Per-trip commission comes from the driver earnings API during sync enrichment.
 */
export function freenowPlatformFeeFromTourValue(
  grossAmountCents: bigint,
  taxPercentage: number | undefined,
): bigint | null {
  void grossAmountCents;
  void taxPercentage;
  return null;
}

function netAfterFeeAndTip(gross: bigint, fee: bigint | null, tip: bigint): bigint | null {
  if (gross <= 0n) return null;
  const commission = fee ?? 0n;
  const net = gross - commission - tip;
  return net >= 0n ? net : null;
}

/** Pre-fill payment bucket columns so Cerrar turnos shows amounts without manual split. */
export function freenowPaymentSplitCents(
  paymentMethod: string | null,
  netAmountCents: bigint | null,
): Pick<NormalizedTripUpsert, "cashPaymentCents" | "cardPaymentCents" | "appPaymentCents"> {
  if (netAmountCents == null || netAmountCents <= 0n) {
    return { cashPaymentCents: null, cardPaymentCents: null, appPaymentCents: null };
  }
  const m = (paymentMethod ?? "").toLowerCase();
  if (m === "app") return { appPaymentCents: netAmountCents, cashPaymentCents: null, cardPaymentCents: null };
  if (m === "cash" || m.includes("efectivo")) {
    return { cashPaymentCents: netAmountCents, cardPaymentCents: null, appPaymentCents: null };
  }
  if (m === "card" || m.includes("tarjeta")) {
    return { cardPaymentCents: netAmountCents, cashPaymentCents: null, appPaymentCents: null };
  }
  return { cashPaymentCents: null, cardPaymentCents: null, appPaymentCents: null };
}

/** Completed FreeNow booking → FleetHub trip upsert. */
export function freenowBookingToUpsert(booking: FreenowBooking): NormalizedTripUpsert | null {
  if (booking.state !== "ACCOMPLISHED") {
    return null;
  }
  const id = booking.id?.trim();
  if (!id) return null;

  const startedAt = booking.pickupDate ? new Date(booking.pickupDate).toISOString() : null;
  const endedAt = booking.dropoffDate ? new Date(booking.dropoffDate).toISOString() : null;
  if (!startedAt) return null;

  const tv = booking.tourValue;
  const gross = eurosToCents(tv?.amount);
  const tip = eurosToCents(tv?.tip) ?? 0n;
  const toll = eurosToCents(tv?.toll) ?? 0n;
  const grossAmountCents = gross ?? 0n;
  const platformFeeCents = null;
  const netAmountCents = netAfterFeeAndTip(grossAmountCents, platformFeeCents, tip);

  const rawPayment = booking.paymentMethod?.trim().toUpperCase();
  const paymentMethod = mapPaymentMethod(booking.paymentMethod);
  const paymentSplit = freenowPaymentSplitCents(paymentMethod, netAmountCents);

  return {
    externalTripId: id,
    startedAt,
    endedAt,
    grossAmountCents,
    platformFeeCents,
    tipCents: tip,
    tollCents: toll,
    netAmountCents,
    paymentMethod,
    ...paymentSplit,
    paymentValidated: rawPayment === "APP",
    fareType: mapFreenowFareType(
      booking.hailingType,
      booking.subFleetTypeLabel,
      (booking as { subFleetTypeId?: string | null }).subFleetTypeId,
      (booking as { fixedFare?: boolean | null }).fixedFare,
    ),
    platformBonusCents: 0n,
  };
}
