import { addTripPaymentAmountsToBuckets, type TripPaymentAmountsInput } from "./trip-payment-amounts";

export type PaymentBucket = "app" | "cash" | "card" | "other";

/** Clasifica `paymentMethod` de viaje (app / efectivo / tarjeta TPV). */
export function classifyPaymentMethod(method: string | null): PaymentBucket {
  const m = (method ?? "").toLowerCase();
  if (m.includes("cash") || m.includes("efectivo")) return "cash";
  if (m.includes("card") || m.includes("tarjeta")) return "card";
  if (m.includes("app")) return "app";
  return "other";
}

/**
 * Viaje con tipo de pago confirmado en operativa (`paymentValidated !== false`).
 * Solo estos importes entran en columnas de cierre (monto a liquidar / cobrar en caja).
 */
export function isCollectiblePaymentTrip(paymentValidated: boolean | undefined): boolean {
  return paymentValidated !== false;
}

export function addNetToPaymentBucket(
  buckets: { appCents: number; cashCents: number; cardCents: number },
  method: string | null,
  netCents: number,
): void {
  const bucket = classifyPaymentMethod(method);
  if (bucket === "cash") buckets.cashCents += netCents;
  else if (bucket === "card") buckets.cardCents += netCents;
  else buckets.appCents += netCents;
}

/** Prefer explicit split columns when present. */
export function addTripToPaymentBuckets(
  buckets: { appCents: number; cashCents: number; cardCents: number },
  trip: TripPaymentAmountsInput,
): void {
  addTripPaymentAmountsToBuckets(buckets, trip);
}
