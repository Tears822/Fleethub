import { classifyPaymentMethod } from "./trip-payment-buckets";

export type TripPaymentAmountsInput = {
  netAmountCents: bigint | null;
  paymentMethod: string | null;
  cashPaymentCents?: bigint | null;
  cardPaymentCents?: bigint | null;
  appPaymentCents?: bigint | null;
};

export type TripPaymentAmounts = {
  app: bigint;
  cash: bigint;
  card: bigint;
};

function netCents(trip: TripPaymentAmountsInput): bigint {
  return trip.netAmountCents ?? BigInt(0);
}

/** True when operativa set explicit split columns (mixed payment). */
export function hasExplicitPaymentSplit(trip: TripPaymentAmountsInput): boolean {
  const cash = trip.cashPaymentCents ?? null;
  const card = trip.cardPaymentCents ?? null;
  const app = trip.appPaymentCents ?? null;
  if (cash == null && card == null && app == null) return false;
  if ((cash ?? BigInt(0)) > BigInt(0) || (card ?? BigInt(0)) > BigInt(0) || (app ?? BigInt(0)) > BigInt(0)) {
    return true;
  }
  return (trip.paymentMethod ?? "").toLowerCase().includes("mixed");
}

/** Amounts per bucket for aggregation / detalle (validated or preview). */
export function resolveTripPaymentAmounts(trip: TripPaymentAmountsInput): TripPaymentAmounts {
  if (hasExplicitPaymentSplit(trip)) {
    const app = trip.appPaymentCents ?? BigInt(0);
    const cash = trip.cashPaymentCents ?? BigInt(0);
    const card = trip.cardPaymentCents ?? BigInt(0);
    const method = (trip.paymentMethod ?? "").toLowerCase();
    // Platform re-sync can leave a stale cash column when payment was confirmed as card (or vice versa).
    if (!method.includes("mixed")) {
      const bucket = classifyPaymentMethod(trip.paymentMethod);
      if (bucket === "card" && card > BigInt(0) && cash === card) {
        return { app: BigInt(0), cash: BigInt(0), card };
      }
      if (bucket === "cash" && cash > BigInt(0) && card === cash) {
        return { app: BigInt(0), cash, card: BigInt(0) };
      }
      if (bucket === "app" && app > BigInt(0) && cash === BigInt(0) && card === BigInt(0)) {
        return { app, cash: BigInt(0), card: BigInt(0) };
      }
      // Uber cash ingest may store gross collected in cashPaymentCents; settlement uses net.
      if (bucket === "cash" && cash > BigInt(0)) {
        const settlementNet = netCents(trip);
        if (settlementNet > BigInt(0) && cash !== settlementNet) {
          return { app: BigInt(0), cash: settlementNet, card: BigInt(0) };
        }
      }
    }
    return { app, cash, card };
  }

  const net = netCents(trip);
  const bucket = classifyPaymentMethod(trip.paymentMethod);
  if (bucket === "cash") return { app: BigInt(0), cash: net, card: BigInt(0) };
  if (bucket === "card") return { app: BigInt(0), cash: BigInt(0), card: net };
  return { app: net, cash: BigInt(0), card: BigInt(0) };
}

export function addTripPaymentAmountsToBuckets(
  buckets: { appCents: number; cashCents: number; cardCents: number },
  trip: TripPaymentAmountsInput,
): void {
  const { app, cash, card } = resolveTripPaymentAmounts(trip);
  buckets.appCents += Number(app);
  buckets.cashCents += Number(cash);
  buckets.cardCents += Number(card);
}

export type PaymentEditMode = "app" | "cash" | "card" | "mixed";

/** Modo de edición inferido desde columnas de pago y `paymentMethod`. */
export function derivePaymentEditMode(trip: TripPaymentAmountsInput): PaymentEditMode {
  const split = resolveTripPaymentAmounts(trip);
  if (split.cash > BigInt(0) && split.card > BigInt(0)) return "mixed";
  if (split.cash > BigInt(0)) return "cash";
  if (split.card > BigInt(0)) return "card";
  const m = (trip.paymentMethod ?? "").toLowerCase();
  if (m.includes("mixed")) return "mixed";
  const bucket = classifyPaymentMethod(trip.paymentMethod);
  if (bucket === "cash") return "cash";
  if (bucket === "card") return "card";
  return "app";
}

/** Efectivo, tarjeta o mixto requieren selector manual en Cerrar turnos. */
export function paymentModeNeedsManualReview(mode: PaymentEditMode): boolean {
  return mode === "cash" || mode === "card" || mode === "mixed";
}

/** Viaje sin confirmar que el operador debe revisar (no pagos App). */
export function tripNeedsManualPaymentReview(
  trip: TripPaymentAmountsInput & { paymentValidated?: boolean },
): boolean {
  if (trip.paymentValidated !== false) return false;
  return paymentModeNeedsManualReview(derivePaymentEditMode(trip));
}

/** Viaje que debe aparecer en avisos / detalle de Cerrar turnos (efectivo/tarjeta sin confirmar o App descuadrado). */
export function tripNeedsPaymentUiAttention(
  trip: TripPaymentBalanceInput & { paymentValidated?: boolean },
): boolean {
  if (tripNeedsManualPaymentReview(trip)) return true;
  if (!tripPaymentUnbalanced(trip)) return false;
  return derivePaymentEditMode(trip) === "app";
}

export function paymentMethodForMode(mode: PaymentEditMode): string {
  if (mode === "mixed") return "mixed";
  if (mode === "cash") return "cash";
  if (mode === "card") return "card";
  return "app";
}

/** Importe bruto del viaje (fallback neto). */
export function tripGrossCents(trip: {
  grossAmountCents?: bigint | null;
  netAmountCents?: bigint | null;
}): bigint {
  const gross = trip.grossAmountCents ?? BigInt(0);
  const net = trip.netAmountCents ?? BigInt(0);
  return gross > BigInt(0) ? gross : net;
}

export type TripPaymentBalanceInput = TripPaymentAmountsInput & {
  grossAmountCents?: bigint | null;
};

/** App + efectivo + tarjeta (en bruto / importe) deben igualar el importe del viaje. */
export function tripPaymentDisplayBalanced(trip: TripPaymentBalanceInput): boolean {
  const gross = tripGrossCents(trip);
  if (gross <= BigInt(0)) return true;

  const net = netCents(trip);
  const split = resolveTripPaymentAmounts(trip);
  const splitSum = split.app + split.cash + split.card;
  if (splitSum <= BigInt(0)) return false;

  // Stored payment columns must match settlement net (or gross when net is absent).
  const settlementOk =
    net > BigInt(0)
      ? splitSum === net
      : splitSum === gross;
  if (!settlementOk) return false;

  const display = resolveTripPaymentDisplayAmounts(trip);
  return display.app + display.cash + display.card === gross;
}

/** Viaje confirmado cuyo desglose de pago no cuadra con el importe. */
export function tripPaymentUnbalanced(trip: TripPaymentBalanceInput & {
  paymentValidated?: boolean;
}): boolean {
  if (trip.paymentValidated === false) return false;
  return !tripPaymentDisplayBalanced(trip);
}

/**
 * Payment buckets aligned to **importe bruto** for UI tables (Pago app / Efectivo / Tarjetas).
 * Settlement and DB columns stay on net via {@link resolveTripPaymentAmounts}.
 */
function scalePaymentBucketsToImporte(
  importeCents: bigint,
  split: TripPaymentAmounts,
  basisCents: bigint,
): TripPaymentAmounts {
  if (importeCents <= BigInt(0) || basisCents <= BigInt(0)) return split;
  const app = (importeCents * split.app) / basisCents;
  const cash = (importeCents * split.cash) / basisCents;
  let card = importeCents - app - cash;
  if (card < BigInt(0)) card = BigInt(0);
  return { app, cash, card };
}

export function resolveTripPaymentDisplayAmounts(
  trip: TripPaymentAmountsInput & {
    grossAmountCents?: bigint | null;
  },
): TripPaymentAmounts {
  const gross = tripGrossCents(trip);
  const net = netCents(trip);
  const split = resolveTripPaymentAmounts(trip);
  const splitSum = split.app + split.cash + split.card;

  if (gross <= BigInt(0) || splitSum <= BigInt(0)) {
    return split;
  }

  // Uber: ganancias (net) may exceed fare (gross) when tips are in net but listed separately.
  if (net > gross && splitSum > gross) {
    return scalePaymentBucketsToImporte(gross, split, splitSum);
  }

  if (net <= BigInt(0)) {
    return splitSum > gross ? scalePaymentBucketsToImporte(gross, split, splitSum) : split;
  }

  if (gross <= net) {
    return split;
  }

  return scalePaymentBucketsToImporte(gross, split, net);
}

/** Reparte neto proporcionalmente cuando el operador reparte el importe bruto. */
export function grossSplitToNetAmounts(
  grossTotal: bigint,
  netTotal: bigint,
  cashGross: bigint,
  cardGross: bigint,
): { cash: bigint; card: bigint } {
  if (grossTotal <= BigInt(0) || netTotal <= BigInt(0)) {
    return { cash: cashGross, card: cardGross };
  }
  const cashNet = (netTotal * cashGross) / grossTotal;
  const cardNet = netTotal - cashNet;
  return { cash: cashNet, card: cardNet };
}

/** Convierte neto almacenado → bruto para re-edición (inputs en importe). */
export function netSplitToGrossAmounts(
  grossTotal: bigint,
  netTotal: bigint,
  cashNet: bigint,
  cardNet: bigint,
): { cash: bigint; card: bigint } {
  if (netTotal <= BigInt(0) || grossTotal <= BigInt(0)) {
    return { cash: cashNet, card: cardNet };
  }
  const cashGross = (grossTotal * cashNet) / netTotal;
  const cardGross = grossTotal - cashGross;
  return { cash: cashGross, card: cardGross };
}

/** Build DB fields from UI mode + optional split (cents). Mixed UI splits on bruto (importe). */
export function buildPaymentUpdateFromMode(
  mode: PaymentEditMode,
  amounts: { netAmountCents: bigint; grossAmountCents: bigint },
  split?: { cashCents?: number; cardCents?: number; appCents?: number },
): {
  paymentMethod: string;
  cashPaymentCents: bigint | null;
  cardPaymentCents: bigint | null;
  appPaymentCents: bigint | null;
} {
  const net = amounts.netAmountCents;
  const gross = tripGrossCents(amounts);

  if (mode === "mixed") {
    const cashGross = BigInt(Math.max(0, Math.round(split?.cashCents ?? 0)));
    const cardGross = BigInt(Math.max(0, Math.round(split?.cardCents ?? 0)));
    const app = BigInt(Math.max(0, Math.round(split?.appCents ?? 0)));
    const sumGross = cashGross + cardGross + app;
    if (sumGross !== gross) {
      throw new Error("La suma efectivo + tarjeta debe igualar el importe del viaje.");
    }
    const { cash, card } = grossSplitToNetAmounts(gross, net, cashGross, cardGross);
    return {
      paymentMethod: "mixed",
      cashPaymentCents: cash,
      cardPaymentCents: card,
      appPaymentCents: app > BigInt(0) ? app : null,
    };
  }

  const method = paymentMethodForMode(mode);
  if (mode === "cash") {
    return {
      paymentMethod: method,
      cashPaymentCents: net,
      cardPaymentCents: null,
      appPaymentCents: null,
    };
  }
  if (mode === "card") {
    return {
      paymentMethod: method,
      cardPaymentCents: net,
      cashPaymentCents: null,
      appPaymentCents: null,
    };
  }
  return {
    paymentMethod: method,
    appPaymentCents: net,
    cashPaymentCents: null,
    cardPaymentCents: null,
  };
}
