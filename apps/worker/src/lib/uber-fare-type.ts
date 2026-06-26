import type { UberPartnerTrip } from "./uber-driver-client.js";

const T3_PATTERNS = [
  /\bt3\b/i,
  /tarifa\s*3/i,
  /precio\s*cerrado/i,
  /\bupfront\b/i,
  /\bfixed\s*fare\b/i,
  /\bflat\s*fare\b/i,
];

function looksLikeT3(label: string): boolean {
  const u = label.trim();
  if (!u) return false;
  return T3_PATTERNS.some((re) => re.test(u));
}

function readTripString(t: UberPartnerTrip, key: string): string | null {
  const v = (t as Record<string, unknown>)[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Best-effort fare label from Uber partner trip / webhook payload fields. */
export function mapUberPartnerTripFareType(t: UberPartnerTrip): string {
  const candidates = [
    readTripString(t, "product_type"),
    readTripString(t, "product_type_description"),
    readTripString(t, "trip_category"),
    readTripString(t, "vehicle_view_type"),
    readTripString(t, "service_type"),
    readTripString(t, "fare_type"),
  ].filter((c): c is string => Boolean(c));

  for (const c of candidates) {
    if (looksLikeT3(c)) return "Precio cerrado (T3)";
  }

  const primary = candidates[0];
  if (primary) return primary;

  return t.currency_code ? `uber-${t.currency_code}` : "uber";
}

/** Map a loose product-type string from webhook meta. */
export function mapUberFareTypeFromLabel(label: string | null | undefined): string {
  if (!label?.trim()) return "uber-webhook";
  if (looksLikeT3(label)) return "Precio cerrado (T3)";
  return label.trim();
}

/** Spanish Payments Order/Driver CSV: Precio vs Taxímetro columns → fare type. */
export function mapUberFareTypeFromPaymentSplit(args: {
  precioCents: bigint | null;
  meterCents: bigint | null;
  productLabel?: string | null;
}): string | null {
  const precioPos = args.precioCents != null && args.precioCents > BigInt(0);
  const meterPos = args.meterCents != null && args.meterCents > BigInt(0);
  if (meterPos && !precioPos) return "Taxímetro";
  if (precioPos && !meterPos) return "Precio cerrado (T3)";
  if (precioPos && meterPos) return "Taxímetro";
  const product = args.productLabel?.trim();
  if (product) {
    const mapped = mapUberFareTypeFromLabel(product);
    if (mapped !== "uber-webhook") return mapped;
  }
  return null;
}

/** Prefer specific fare labels over generic Uber placeholders when merging sources. */
export function uberFareTypeMergeScore(fareType: string | null | undefined): number {
  if (!fareType?.trim()) return 0;
  const lower = fareType.trim().toLowerCase();
  if (lower.includes("precio cerrado") || lower.includes("tarifa 3") || /\bt3\b/.test(lower)) {
    return 4;
  }
  if (lower.includes("taxímetro") || lower.includes("taximetro")) return 4;
  const generic = new Set([
    "uber",
    "fare",
    "uber-webhook",
    "payments_driver",
    "payments_order",
    "taxi",
  ]);
  if (generic.has(lower) || /^uber-[a-z]{3}$/i.test(fareType.trim())) return 1;
  return 3;
}
