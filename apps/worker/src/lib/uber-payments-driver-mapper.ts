import type { NormalizedTripUpsert } from "@fleethub/contracts";
import {
  type UberCsvRow,
  parseEuroAmount,
  parseUberDateTime,
  pickColumn,
  pickColumnExact,
  pickColumnMatching,
} from "./uber-csv-columns.js";
import { mapUberFareTypeFromPaymentSplit } from "./uber-fare-type.js";
import { mergeUberDriverTripUpserts } from "./uber-driver-mappers.js";
import { uberTripActivityToUpsert } from "./uber-trip-activity-mapper.js";

export type UberTripActivityRow = UberCsvRow;

function parseDateTime(raw: string): string | null {
  return parseUberDateTime(raw);
}

/** Must not fuzzy-match «Importe que se te ha pagado» (net earnings). */
function pickCashCollectedColumn(row: UberCsvRow): string {
  return (
    pickColumnExact(row, [
      "Importe que se te ha pagado : Saldo del viaje : Pagos : Efectivo cobrado",
      "Importe que se te ha pagado:Saldo del viaje:Pagos:Efectivo cobrado",
      "Cash Collected",
    ]) ||
    pickColumnMatching(row, ["saldo", "efectivo"]) ||
    pickColumnMatching(row, ["cash", "collected"])
  );
}

/** Parse fare/fee/tip/net from Spanish or English Payments Driver CSV row. */
export function parsePaymentsDriverAmounts(row: UberCsvRow): {
  grossAmountCents: bigint | null;
  platformFeeCents: bigint | null;
  tipCents: bigint;
  netAmountCents: bigint | null;
  cashPaymentCents: bigint | null;
  precioComponentCents: bigint | null;
  meterComponentCents: bigint | null;
} {
  const fareRaw =
    pickColumn(row, [
      "Importe que se te ha pagado : Tus ganancias : Precio",
      "Fare",
      "Trip Fare",
      "Total Fare",
      "Tarifa",
    ]) ||
    pickColumnMatching(row, ["importe", "tus ganancias", "precio"], [
      "servicio",
      "propina",
      "impuesto",
      "cancelacion",
      "recargo",
      "taximetro",
      "ajuste",
      "promocion",
    ]) ||
    pickColumn(row, ["Importe que se te ha pagado:Tus ganancias:Precio:Precio"]);

  const meterRaw = pickColumnExact(row, [
    "Importe que se te ha pagado:Tus ganancias:Precio:Taxímetro",
    "Importe que se te ha pagado:Tus ganancias:Precio:Taximetro",
  ]);

  const precioComponentRaw = pickColumnExact(row, [
    "Importe que se te ha pagado:Tus ganancias:Precio:Precio",
  ]);

  const serviceFeeRaw = pickColumn(row, [
    "Importe que se te ha pagado:Tus ganancias:Precio del servicio",
    "Service Fee",
    "Uber Service Fee",
    "Comisión",
  ]);

  const tipRaw = pickColumnExact(row, [
    "Importe que se te ha pagado:Tus ganancias:Propina",
    "Tip",
  ]);

  const netRaw = pickColumn(row, [
    "Importe que se te ha pagado : Tus ganancias",
    "Importe que se te ha pagado",
    "Net Fare",
    "Driver Earnings",
    "Earnings",
    "Payout",
  ]);

  const cashRaw = pickCashCollectedColumn(row);

  const parentPrecioRaw = pickColumnExact(row, [
    "Importe que se te ha pagado : Tus ganancias : Precio",
    "Importe que se te ha pagado:Tus ganancias:Precio",
  ]);

  const precioComponentCents = parseEuroAmount(precioComponentRaw);
  const meterComponentCents = parseEuroAmount(meterRaw);
  const parentPrecioCents = parseEuroAmount(parentPrecioRaw);
  let grossAmountCents =
    parentPrecioCents ??
    precioComponentCents ??
    meterComponentCents ??
    parseEuroAmount(fareRaw);
  let platformFeeCents = serviceFeeRaw ? parseEuroAmount(serviceFeeRaw) : null;
  const tipCents = parseEuroAmount(tipRaw) ?? BigInt(0);

  const tipOnlyRow =
    tipRaw.trim().length > 0 &&
    parentPrecioRaw.trim().length === 0 &&
    precioComponentRaw.trim().length === 0 &&
    meterRaw.trim().length === 0;
  if (tipOnlyRow) {
    grossAmountCents = null;
    platformFeeCents = null;
  }

  let netAmountCents = parseEuroAmount(netRaw);

  if (netAmountCents == null && grossAmountCents != null && platformFeeCents != null) {
    netAmountCents = grossAmountCents - platformFeeCents + tipCents;
  }
  if (netAmountCents == null) {
    netAmountCents = tipOnlyRow ? tipCents : grossAmountCents;
  }
  if (grossAmountCents == null) {
    // net may include fee; keep gross aligned when only net is present
  }

  const cashPaymentCents = parseEuroAmount(cashRaw);

  return {
    grossAmountCents,
    platformFeeCents,
    tipCents,
    netAmountCents,
    cashPaymentCents,
    precioComponentCents,
    meterComponentCents,
  };
}

/** Infer taxímetro vs T3 from Spanish Uber payments report columns. */
export function mapUberPaymentsRowFareType(row: UberCsvRow): string | null {
  const amounts = parsePaymentsDriverAmounts(row);
  const product = pickColumn(row, [
    "Product Type",
    "Service Type",
    "Tipo de producto",
    "Tipo de servicio",
  ]);
  return mapUberFareTypeFromPaymentSplit({
    precioCents: amounts.precioComponentCents,
    meterCents: amounts.meterComponentCents,
    productLabel: product || null,
  });
}

function paymentMethodFromRow(row: UberCsvRow, cashPaymentCents: bigint | null): string {
  const paymentType = pickColumn(row, [
    "Payment Type",
    "Payment Method",
    "Tipo de pago",
    "Forma de pago",
  ]).toLowerCase();
  if (paymentType.includes("cash") || paymentType.includes("efectivo")) return "cash";
  if (cashPaymentCents != null && cashPaymentCents > BigInt(0)) return "cash";
  return "app";
}

/** Tip paid days after the trip — separate liquidation line on payment day, not merged into fare. */
export function isLateTipOnlyPaymentsUpsert(t: NormalizedTripUpsert): boolean {
  const gross = t.grossAmountCents ?? BigInt(0);
  const tip = t.tipCents ?? BigInt(0);
  return gross <= BigInt(0) && tip > BigInt(0);
}

export function lateTipExternalTripId(baseTripId: string, paidAtIso: string): string {
  const day = paidAtIso.slice(0, 10);
  return `${baseTripId.trim()}::tip::${day}`;
}

/** Map one Payments Driver CSV row → trip upsert when trip UUID is present. */
export function paymentsDriverRowToUpsert(row: UberCsvRow): NormalizedTripUpsert | null {
  const tripId = pickColumn(row, [
    "Trip UUID",
    "trip_uuid",
    "UUID del viaje",
    "UUID de viaje",
    "Trip ID",
  ]);
  if (!tripId) return null;

  const activityUpsert = uberTripActivityToUpsert(row);
  const amounts = parsePaymentsDriverAmounts(row);
  const hasAmount =
    amounts.grossAmountCents != null ||
    amounts.netAmountCents != null ||
    amounts.platformFeeCents != null;

  const paidAt =
    parseDateTime(
      pickColumn(row, [
        "en comparación con los informes",
        "en comparacion con los informes",
        "Processed At",
        "Payment Date",
        "Fecha de pago",
        "Trip DropOff Time",
        "Hora de finalización del viaje",
        "Hora de finalizacion del viaje",
        "Hora de llegada del viaje",
      ]),
    ) ?? activityUpsert?.startedAt;

  if (!paidAt && !activityUpsert && !hasAmount) return null;

  const startedAt = activityUpsert?.startedAt ?? paidAt ?? new Date().toISOString();
  const endedAt = activityUpsert?.endedAt ?? paidAt ?? startedAt;
  const cash = amounts.cashPaymentCents;
  const method = paymentMethodFromRow(row, cash);
  const net = hasAmount ? amounts.netAmountCents : activityUpsert?.netAmountCents ?? null;
  const tip = hasAmount ? amounts.tipCents : activityUpsert?.tipCents ?? BigInt(0);
  const netForApp =
    net != null && tip > BigInt(0) && net > tip ? net - tip : net;
  const cashPaymentCents = cash != null && cash > BigInt(0) ? cash : null;
  const appPaymentCents =
    cashPaymentCents != null && net != null && net > cashPaymentCents
      ? net - cashPaymentCents
      : method === "app" && netForApp != null && netForApp > BigInt(0)
        ? netForApp
        : null;

  return {
    externalTripId: tripId,
    startedAt,
    endedAt,
    grossAmountCents: hasAmount ? amounts.grossAmountCents : activityUpsert?.grossAmountCents ?? null,
    platformFeeCents: hasAmount ? amounts.platformFeeCents : activityUpsert?.platformFeeCents ?? null,
    tipCents: hasAmount ? amounts.tipCents : activityUpsert?.tipCents ?? BigInt(0),
    tollCents: activityUpsert?.tollCents ?? BigInt(0),
    netAmountCents: net,
    paymentMethod: method,
    cashPaymentCents,
    appPaymentCents,
    paymentValidated: true,
    fareType:
      mapUberPaymentsRowFareType(row) ??
      activityUpsert?.fareType ??
      "payments_order",
  };
}

/** Payments driver report rows — trip-level rows with fare/fee columns. */
export function filterPaymentsDriverRows(
  rows: UberCsvRow[],
  args: { driverId: string; from: Date; to: Date },
): NormalizedTripUpsert[] {
  const driverId = args.driverId.trim().toLowerCase();
  const fromMs = args.from.getTime();
  const toMs = args.to.getTime();
  const byTrip = new Map<string, NormalizedTripUpsert>();

  for (const row of rows) {
    const rowDriver = pickColumn(row, [
      "Driver UUID",
      "driver_uuid",
      "UUID del conductor",
      "UUID de conductor",
      "Earner UUID",
    ]).toLowerCase();
    if (rowDriver && rowDriver !== driverId) continue;

    const upsert = paymentsDriverRowToUpsert(row);
    if (!upsert) continue;

    // Report is already scoped to the requested dateRange filter.
    if (!tripUpsertHasAmounts(upsert)) {
      const t = new Date(upsert.startedAt).getTime();
      if (t < fromMs || t > toMs) continue;
    }

    if (isLateTipOnlyPaymentsUpsert(upsert)) {
      const tipLine: NormalizedTripUpsert = {
        ...upsert,
        externalTripId: lateTipExternalTripId(upsert.externalTripId, upsert.startedAt),
        grossAmountCents: null,
        platformFeeCents: null,
        fareType: "Propina (día pago)",
      };
      byTrip.set(tipLine.externalTripId, tipLine);
      continue;
    }

    const prev = byTrip.get(upsert.externalTripId);
    byTrip.set(
      upsert.externalTripId,
      prev ? mergeUberDriverTripUpserts([prev], [upsert])[0] ?? upsert : upsert,
    );
  }

  return [...byTrip.values()];
}

export function tripUpsertHasAmounts(t: NormalizedTripUpsert): boolean {
  return (
    (t.grossAmountCents != null && t.grossAmountCents > BigInt(0)) ||
    (t.netAmountCents != null && t.netAmountCents > BigInt(0))
  );
}

/** Trips in [from, to] that still lack fare/net after activity / payments-order merge. */
export function tripsInWindowMissingAmounts(
  trips: NormalizedTripUpsert[],
  from: Date,
  to: Date,
): boolean {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  return trips.some((t) => {
    const ts = new Date(t.startedAt).getTime();
    if (ts < fromMs || ts > toMs) return false;
    return !tripUpsertHasAmounts(t);
  });
}

export function countTripsWithAmounts(trips: NormalizedTripUpsert[]): number {
  return trips.filter((t) => tripUpsertHasAmounts(t)).length;
}
