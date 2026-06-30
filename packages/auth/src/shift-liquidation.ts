import { isCollectiblePaymentTrip } from "./trip-payment-buckets";
import {
  resolveTripPaymentAmounts,
  tripGrossCents,
  tripNeedsManualPaymentReview,
  tripPaymentUnbalanced,
} from "./trip-payment-amounts";

/** Trip fields needed to compute a shift liquidation summary (FRD §7.4). */

export type LiquidationTripInput = {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  fareType: string | null;
  grossAmountCents: bigint | null;
  netAmountCents: bigint | null;
  platformFeeCents: bigint | null;
  tipCents: bigint | null;
  platformBonusCents: bigint | null;
  tollCents: bigint | null;
  paymentMethod: string | null;
  cashPaymentCents?: bigint | null;
  cardPaymentCents?: bigint | null;
  appPaymentCents?: bigint | null;
  paymentValidated: boolean;
};

export type LiquidationDriverEconomics = {
  driverSharePct: number | null;
  driverBonusSharePct: number | null;
  driverPlatformFeeSharePct?: number | null;
  dailyFixedCents?: number | null;
};

export type LiquidationSummary = {
  tripCount: number;
  unvalidatedCount: number;
  /** Viajes confirmados cuyo desglose app/efectivo/tarjeta no iguala el importe. */
  unbalancedPaymentCount: number;
  grossCents: number;
  netCents: number;
  vatCents: number;
  tipsCents: number;
  tollsCents: number;
  bonusCents: number;
  driverBonusSharePct: number;
  driverBonusCents: number;
  companyBonusCents: number;
  cashCents: number;
  cardCents: number;
  appPaymentCents: number;
  t3Cents: number;
  platformFeeCents: number;
  driverPlatformFeeSharePct: number;
  driverPlatformFeeCents: number;
  companyPlatformFeeCents: number;
  dailyFixedCents: number;
  driverSharePct: number;
  driverNetCents: number;
  companyNetCents: number;
  totalToSettleCents: number;
  periodFrom: string | null;
  periodTo: string | null;
};

const VAT_RATE = 0.1;

function toNumber(cents: bigint | null | undefined): number {
  if (cents == null) return 0;
  return Number(cents);
}

function liquidationTripGrossCents(t: LiquidationTripInput): number {
  if (t.grossAmountCents != null) return toNumber(t.grossAmountCents);
  const net = toNumber(t.netAmountCents);
  const fee = toNumber(t.platformFeeCents);
  return net + fee;
}

function tripNetCents(t: LiquidationTripInput): number {
  if (t.netAmountCents != null) return toNumber(t.netAmountCents);
  return liquidationTripGrossCents(t) - toNumber(t.platformFeeCents);
}

type TripFeeFields = Pick<
  LiquidationTripInput,
  "grossAmountCents" | "netAmountCents" | "platformFeeCents" | "tipCents"
>;

/** Infer platform fee when stored net already reflects commission but `platformFeeCents` is empty. */
export function resolveTripFeeCents(trip: TripFeeFields): bigint {
  const stored = trip.platformFeeCents ?? BigInt(0);
  if (stored > BigInt(0)) return stored;

  const gross = trip.grossAmountCents;
  const net = trip.netAmountCents;
  if (gross == null || net == null || gross <= net) return BigInt(0);

  const tip = trip.tipCents ?? BigInt(0);
  const withTips = gross - net - tip;
  if (withTips > BigInt(0)) return withTips;

  const withoutTips = gross - net;
  return withoutTips > BigInt(0) ? withoutTips : BigInt(0);
}

function clampPct(value: number | null | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** Precio cerrado (T3) — no suma en taxímetro; se liquida aparte (spec Pantalla 3). */
export function isT3Fare(fareType: string | null): boolean {
  if (!fareType) return false;
  const u = fareType.toUpperCase();
  return (
    u.includes("T3") ||
    u.includes("TARIFA 3") ||
    u.includes("PRECIO CERRADO") ||
    u === "3"
  );
}

/** Propina liquidada aparte (p. ej. Uber «día pago») — no es servicio taxímetro ni T3. */
export function isTipOnlyFare(fareType: string | null): boolean {
  if (!fareType?.trim()) return false;
  return fareType.trim().toLowerCase().includes("propina");
}

export type TripTaximetroInput = {
  fareType: string | null;
  grossAmountCents?: bigint | null;
  netAmountCents?: bigint | null;
  tipCents?: bigint | null;
};

/** Importe que cuenta en columna Taxímetro (excluye T3 y líneas solo propina). */
export function tripTaximetroCents(trip: TripTaximetroInput): bigint {
  if (isT3Fare(trip.fareType)) return BigInt(0);
  if (isTipOnlyFare(trip.fareType)) return BigInt(0);
  const gross = tripGrossCents(trip);
  const tip = trip.tipCents ?? BigInt(0);
  const storedGross = trip.grossAmountCents ?? BigInt(0);
  // Propina en día de pago sin bruto de servicio (Uber payments driver).
  if (storedGross <= BigInt(0) && tip > BigInt(0) && gross === tip) return BigInt(0);
  return gross;
}

const GENERIC_UBER_FARE_LABELS = new Set([
  "payments_order",
  "payments_driver",
  "uber",
  "taxi",
]);

/** Higher score = more specific fare label (T3 / taxímetro beat generic "Taxi"). */
export function fareTypeMergeScore(fareType: string | null | undefined): number {
  if (!fareType?.trim()) return 0;
  const trimmed = fareType.trim();
  if (isT3Fare(trimmed)) return 4;
  const lower = trimmed.toLowerCase();
  if (lower.includes("taxímetro") || lower.includes("taximetro")) return 4;
  if (GENERIC_UBER_FARE_LABELS.has(lower)) return 1;
  return 3;
}

/** Prefer the more specific fare label when merging ingest sources (activity vs payments). */
export function preferMergedFareType(
  incoming: string | null | undefined,
  existing: string | null | undefined,
): string | null {
  const scoreIncoming = fareTypeMergeScore(incoming);
  const scoreExisting = fareTypeMergeScore(existing);
  if (scoreIncoming > scoreExisting) return incoming?.trim() || null;
  if (scoreExisting > scoreIncoming) return existing?.trim() || null;
  const inTrim = incoming?.trim();
  const exTrim = existing?.trim();
  return inTrim || exTrim || null;
}

export function formatFareTypeLabel(fareType: string | null): string {
  if (!fareType?.trim()) return "Taxímetro";
  const normalized = fareType.trim().toLowerCase();
  if (
    normalized === "payments_order" ||
    normalized === "payments_driver" ||
    normalized === "uber" ||
    normalized === "taxi"
  ) {
    return "Taxi";
  }
  if (isT3Fare(fareType)) return "Precio cerrado (T3)";
  return fareType.trim();
}

/**
 * Liquidation engine for shift close (FRD §7.4).
 * Revenue split on net; primas split per `driverBonusSharePct`; tips/tolls to conductor; cash deducted.
 */
export function computeLiquidationSummary(
  trips: LiquidationTripInput[],
  economics: LiquidationDriverEconomics | number | null,
): LiquidationSummary {
  const driverSharePct = clampPct(
    typeof economics === "object" && economics !== null
      ? economics.driverSharePct
      : typeof economics === "number"
        ? economics
        : null,
    50,
  );
  const driverBonusSharePct = clampPct(
    typeof economics === "object" && economics !== null ? economics.driverBonusSharePct : null,
    50,
  );
  const driverPlatformFeeSharePct = clampPct(
    typeof economics === "object" && economics !== null
      ? economics.driverPlatformFeeSharePct
      : null,
    0,
  );
  const dailyFixedCents =
    typeof economics === "object" && economics !== null && economics.dailyFixedCents != null
      ? Math.max(0, Math.round(economics.dailyFixedCents))
      : 0;

  let grossCents = 0;
  let tipsCents = 0;
  let tollsCents = 0;
  let bonusCents = 0;
  let cashCents = 0;
  let cardCents = 0;
  let appPaymentCents = 0;
  let t3Cents = 0;
  let platformFeeCents = 0;
  let unvalidatedCount = 0;
  let unbalancedPaymentCount = 0;

  let periodFrom: Date | null = null;
  let periodTo: Date | null = null;

  for (const t of trips) {
    const gross = liquidationTripGrossCents(t);
    grossCents += gross;
    tipsCents += toNumber(t.tipCents);
    tollsCents += toNumber(t.tollCents);
    bonusCents += toNumber(t.platformBonusCents);
    platformFeeCents += toNumber(t.platformFeeCents);

    if (isT3Fare(t.fareType)) {
      t3Cents += gross;
    }

    if (tripNeedsManualPaymentReview(t)) unvalidatedCount += 1;
    if (tripPaymentUnbalanced(t)) unbalancedPaymentCount += 1;

    if (isCollectiblePaymentTrip(t.paymentValidated)) {
      const split = resolveTripPaymentAmounts(t);
      cashCents += Number(split.cash);
      cardCents += Number(split.card);
      appPaymentCents += Number(split.app);
    }

    if (!periodFrom || t.startedAt < periodFrom) periodFrom = t.startedAt;
    const end = t.endedAt ?? t.startedAt;
    if (!periodTo || end > periodTo) periodTo = end;
  }

  const driverBonusCents = Math.round((bonusCents * driverBonusSharePct) / 100);
  const companyBonusCents = bonusCents - driverBonusCents;
  const driverPlatformFeeCents = Math.round(
    (platformFeeCents * driverPlatformFeeSharePct) / 100,
  );
  const companyPlatformFeeCents = platformFeeCents - driverPlatformFeeCents;

  const vatCents = Math.round((grossCents * VAT_RATE) / (1 + VAT_RATE));
  /** Base imponible (bruto sin IVA 10 %) — reparto conductor/empresa (FRD §7.4). */
  const netCents = grossCents - vatCents;
  const driverNetCents = Math.round((netCents * driverSharePct) / 100);
  const companyNetCents = netCents - driverNetCents;
  const totalToSettleCents =
    driverNetCents -
    cashCents +
    tipsCents +
    tollsCents +
    driverBonusCents +
    driverPlatformFeeCents +
    dailyFixedCents;

  return {
    tripCount: trips.length,
    unvalidatedCount,
    unbalancedPaymentCount,
    grossCents,
    netCents,
    vatCents,
    tipsCents,
    tollsCents,
    bonusCents,
    driverBonusSharePct,
    driverBonusCents,
    companyBonusCents,
    cashCents,
    cardCents,
    appPaymentCents,
    t3Cents,
    platformFeeCents,
    driverPlatformFeeSharePct,
    driverPlatformFeeCents,
    companyPlatformFeeCents,
    dailyFixedCents,
    driverSharePct,
    driverNetCents,
    companyNetCents,
    totalToSettleCents,
    periodFrom: periodFrom?.toISOString() ?? null,
    periodTo: periodTo?.toISOString() ?? null,
  };
}
