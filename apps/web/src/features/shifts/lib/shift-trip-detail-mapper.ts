import type {
  PlatformBlock,
  RowDetail,
  ShiftActivity,
  TripLine,
} from "@/features/shifts/lib/cerrar-turnos-mock-detail";
import { shiftPlatformDisplayName } from "@/features/shifts/lib/shift-platform";
import type { ShiftPlatformName } from "@/features/shifts/ui/cerrar-turnos-types";
import type { ShiftActivityDto } from "@fleethub/auth/shift-activity";
import { computeDayMetricsFromTripSlices } from "@fleethub/auth/day-metrics";
import { formatShiftEurHora, parseShiftHorasConectadoMinutes } from "@fleethub/auth/shift-activity";
import { formatFareTypeLabel, isT3Fare, resolveTripFeeCents } from "@fleethub/auth/shift-liquidation";
import {
  resolveTripPaymentDisplayAmounts,
  tripNeedsPaymentUiAttention,
  tripPaymentUnbalanced,
  tripGrossCents,
} from "@fleethub/auth/trip-payment-amounts";
import type { RidePlatform } from "@prisma/client";
import { formatDateTimeInTenantTz } from "@/shared/lib/tenant-timezone";

export type ApiShiftTrip = {
  id: string;
  platform: RidePlatform;
  startedAt: string;
  endedAt: string | null;
  fareType: string | null;
  paymentMethod: string | null;
  cashPaymentCents?: string | null;
  cardPaymentCents?: string | null;
  appPaymentCents?: string | null;
  grossAmountCents: string | null;
  platformFeeCents: string | null;
  tipCents: string | null;
  platformBonusCents?: string | null;
  tollCents: string | null;
  netAmountCents: string | null;
  paymentValidated?: boolean;
};

function parseCents(value: string | null): bigint {
  if (!value) return BigInt(0);
  try {
    return BigInt(value);
  } catch {
    return BigInt(0);
  }
}

/** Preserve null when DB has no explicit split column (avoid 0 → false "explicit split"). */
function parseOptionalCents(value: string | null | undefined): bigint | null {
  if (value == null || value === "") return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function eurosFromCents(cents: bigint): number {
  return Math.round(Number(cents)) / 100;
}

function formatEuroFromCents(cents: bigint): string {
  const euros = eurosFromCents(cents);
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(euros);
}

function formatDateTime(iso: string): string {
  return formatDateTimeInTenantTz(iso);
}

function platformLabel(p: RidePlatform): ShiftPlatformName {
  return shiftPlatformDisplayName(p);
}

function paymentLabel(
  method: string | null,
  split: { cash: bigint; card: bigint; app: bigint },
): string {
  const hasCash = split.cash > BigInt(0);
  const hasCard = split.card > BigInt(0);
  const hasApp = split.app > BigInt(0);
  const parts: string[] = [];
  if (hasApp) parts.push("App");
  if (hasCash) parts.push("Efectivo");
  if (hasCard) parts.push("Tarjeta");
  if (parts.length > 1) return parts.join(" + ");
  if (parts.length === 1) return parts[0]!;
  if (!method) return "—";
  const m = method.toLowerCase();
  if (m.includes("mixed")) return "Mixto";
  if (m.includes("cash") || m.includes("efectivo")) return "Efectivo";
  if (m.includes("card") || m.includes("tarjeta")) return "Tarjeta";
  if (m.includes("app")) return "App";
  return method;
}

function tripFeeCents(trip: ApiShiftTrip): bigint {
  return resolveTripFeeCents({
    grossAmountCents: parseCents(trip.grossAmountCents),
    netAmountCents: parseCents(trip.netAmountCents),
    platformFeeCents: parseCents(trip.platformFeeCents),
    tipCents: parseCents(trip.tipCents),
  });
}

function tripAmountMissing(gross: bigint, net: bigint): boolean {
  return gross <= BigInt(0) && net <= BigInt(0);
}

function tripToLine(trip: ApiShiftTrip): TripLine {
  const grossRaw = parseOptionalCents(trip.grossAmountCents);
  const netRaw = parseOptionalCents(trip.netAmountCents);
  const gross = grossRaw ?? BigInt(0);
  const fee = tripFeeCents(trip);
  const tip = parseCents(trip.tipCents);
  const toll = parseCents(trip.tollCents);
  const net = netRaw ?? BigInt(0);
  const split = resolveTripPaymentDisplayAmounts({
    grossAmountCents: grossRaw,
    netAmountCents: netRaw,
    paymentMethod: trip.paymentMethod,
    cashPaymentCents: parseOptionalCents(trip.cashPaymentCents),
    cardPaymentCents: parseOptionalCents(trip.cardPaymentCents),
    appPaymentCents: parseOptionalCents(trip.appPaymentCents),
  });
  const method = paymentLabel(trip.paymentMethod, split);
  const appCents = split.app;
  const cashCents = split.cash;
  const cardCents = split.card;

  const importeCents = tripGrossCents({ grossAmountCents: grossRaw, netAmountCents: netRaw });
  const t3Cents = isT3Fare(trip.fareType) ? importeCents : BigInt(0);
  const taximetroCents = importeCents - t3Cents;
  const comisionNum = fee > BigInt(0) ? -eurosFromCents(fee) : 0;
  const amountMissing = tripAmountMissing(gross, net);

  return {
    fechaHora: formatDateTime(trip.startedAt),
    tarifa: formatFareTypeLabel(trip.fareType),
    tipoPago: method,
    paymentMethod: trip.paymentMethod,
    importe: amountMissing ? "Pendiente" : formatEuroFromCents(importeCents),
    taximetro: amountMissing ? "—" : formatEuroFromCents(taximetroCents),
    t3: amountMissing ? "—" : formatEuroFromCents(t3Cents),
    app: amountMissing ? "—" : appCents > BigInt(0) ? formatEuroFromCents(appCents) : "0,00 €",
    efectivo: amountMissing
      ? "—"
      : cashCents > BigInt(0)
        ? formatEuroFromCents(cashCents)
        : "0,00 €",
    tarjeta: amountMissing
      ? "—"
      : cardCents > BigInt(0)
        ? formatEuroFromCents(cardCents)
        : "0,00 €",
    comision: amountMissing ? "—" : fee > BigInt(0) ? `-${formatEuroFromCents(fee)}` : "0,00 €",
    total: amountMissing ? "Pendiente" : formatEuroFromCents(net),
    propinas: formatEuroFromCents(tip),
    primas: formatEuroFromCents(parseCents(trip.platformBonusCents ?? null)),
    peajes: formatEuroFromCents(toll),
    importeNum: eurosFromCents(importeCents),
    taximetroNum: eurosFromCents(taximetroCents),
    t3Num: eurosFromCents(t3Cents),
    appNum: eurosFromCents(appCents),
    efectivoNum: eurosFromCents(cashCents),
    tarjetaNum: eurosFromCents(cardCents),
    comisionNum,
    totalNum: eurosFromCents(net),
    propinasNum: eurosFromCents(tip),
    primasNum: eurosFromCents(parseCents(trip.platformBonusCents ?? null)),
    peajesNum: eurosFromCents(toll),
    pagoSinConfirmar: trip.paymentValidated === false,
    pagoDescuadrado: tripPaymentUnbalanced({
      grossAmountCents: grossRaw,
      netAmountCents: netRaw,
      paymentMethod: trip.paymentMethod,
      cashPaymentCents: parseOptionalCents(trip.cashPaymentCents),
      cardPaymentCents: parseOptionalCents(trip.cardPaymentCents),
      appPaymentCents: parseOptionalCents(trip.appPaymentCents),
      paymentValidated: trip.paymentValidated ?? true,
    }),
    tripId: trip.id,
    netCents: eurosFromCents(net),
  };
}

function sumTripsFromApi(trips: ApiShiftTrip[], label: string): TripLine {
  let importeCents = BigInt(0);
  let t3Cents = BigInt(0);
  let taximetroCents = BigInt(0);
  let appCents = BigInt(0);
  let cashCents = BigInt(0);
  let cardCents = BigInt(0);
  let comisionCents = BigInt(0);
  let totalCents = BigInt(0);
  let propinasCents = BigInt(0);
  let primasCents = BigInt(0);
  let peajesCents = BigInt(0);

  for (const trip of trips) {
    const grossRaw = parseOptionalCents(trip.grossAmountCents);
    const netRaw = parseOptionalCents(trip.netAmountCents);
    const gross = grossRaw ?? BigInt(0);
    const net = netRaw ?? BigInt(0);
    const fee = tripFeeCents(trip);
    const tip = parseCents(trip.tipCents);
    const toll = parseCents(trip.tollCents);
    const importe = tripGrossCents({ grossAmountCents: grossRaw, netAmountCents: netRaw });
    const split = resolveTripPaymentDisplayAmounts({
      grossAmountCents: grossRaw,
      netAmountCents: netRaw,
      paymentMethod: trip.paymentMethod,
      cashPaymentCents: parseOptionalCents(trip.cashPaymentCents),
      cardPaymentCents: parseOptionalCents(trip.cardPaymentCents),
      appPaymentCents: parseOptionalCents(trip.appPaymentCents),
    });

    importeCents += importe;
    const tripT3 = isT3Fare(trip.fareType) ? importe : BigInt(0);
    t3Cents += tripT3;
    taximetroCents += importe - tripT3;
    appCents += split.app;
    cashCents += split.cash;
    cardCents += split.card;
    comisionCents += fee;
    totalCents += net;
    propinasCents += tip;
    primasCents += parseCents(trip.platformBonusCents ?? null);
    peajesCents += toll;
  }

  const importeNum = eurosFromCents(importeCents);
  const t3Num = eurosFromCents(t3Cents);
  const taximetroNum = eurosFromCents(taximetroCents);
  const appNum = eurosFromCents(appCents);
  const efectivoNum = eurosFromCents(cashCents);
  const tarjetaNum = eurosFromCents(cardCents);
  const comisionNum = comisionCents > BigInt(0) ? -eurosFromCents(comisionCents) : 0;
  const totalNum = eurosFromCents(totalCents);
  const propinasNum = eurosFromCents(propinasCents);
  const primasNum = eurosFromCents(primasCents);
  const peajesNum = eurosFromCents(peajesCents);

  return {
    fechaHora: label,
    tarifa: "",
    tipoPago: "",
    importe: formatEuroFromCents(importeCents),
    taximetro: formatEuroFromCents(taximetroCents),
    t3: formatEuroFromCents(t3Cents),
    app: formatEuroFromCents(appCents),
    efectivo: formatEuroFromCents(cashCents),
    tarjeta: formatEuroFromCents(cardCents),
    comision: comisionCents > BigInt(0) ? `-${formatEuroFromCents(comisionCents)}` : "0,00 €",
    total: formatEuroFromCents(totalCents),
    propinas: formatEuroFromCents(propinasCents),
    primas: formatEuroFromCents(primasCents),
    peajes: formatEuroFromCents(peajesCents),
    importeNum,
    taximetroNum,
    t3Num,
    appNum,
    efectivoNum,
    tarjetaNum,
    comisionNum,
    totalNum,
    propinasNum,
    primasNum,
    peajesNum,
  };
}

function activityFromTrips(trips: ApiShiftTrip[]): ShiftActivity {
  if (trips.length === 0) {
    return {
      viajesRealizados: 0,
      horasConectado: "0h 0min",
      eurHora: "0,00 €",
      noAtendidos: 0,
      rechazados: 0,
    };
  }
  let gross = BigInt(0);
  for (const t of trips) {
    const g = parseCents(t.grossAmountCents);
    const n = parseCents(t.netAmountCents);
    gross += g > BigInt(0) ? g : n;
  }
  const slices = trips.map((t) => ({
    startedAt: new Date(t.startedAt),
    endedAt: t.endedAt ? new Date(t.endedAt) : null,
  }));
  const { hoursOnline } = computeDayMetricsFromTripSlices(slices);
  const activeMinutes = Math.round(hoursOnline * 60);
  return {
    viajesRealizados: trips.length,
    horasConectado: formatShiftHorasConectado(activeMinutes),
    eurHora: formatShiftEurHora(gross, activeMinutes),
    noAtendidos: 0,
    rechazados: 0,
    source: "estimated",
  };
}

function formatShiftHorasConectado(activeMinutes: number): string {
  const hoursWhole = Math.floor(activeMinutes / 60);
  const mins = activeMinutes % 60;
  return `${hoursWhole}h ${mins}min`;
}

/** Prefer platform-synced hours when available; otherwise estimate from trip windows. */
function mergeActivityFromTrips(
  trips: ApiShiftTrip[],
  activity?: ShiftActivityDto | null,
): ShiftActivity {
  const fromTrips = activityFromTrips(trips);
  if (!activity) return fromTrips;

  const platformMinutes = parseShiftHorasConectadoMinutes(activity.horasConectado);
  const usePlatformHours = activity.source === "platform" && platformMinutes > 0;
  const horasConectado = usePlatformHours
    ? activity.horasConectado
    : fromTrips.horasConectado;

  let gross = BigInt(0);
  for (const t of trips) {
    const g = parseCents(t.grossAmountCents);
    const n = parseCents(t.netAmountCents);
    gross += g > BigInt(0) ? g : n;
  }
  const activeMinutes = parseShiftHorasConectadoMinutes(horasConectado);

  return {
    ...activity,
    horasConectado,
    eurHora: formatShiftEurHora(gross, activeMinutes),
    viajesRealizados: fromTrips.viajesRealizados,
    source: usePlatformHours ? activity.source : fromTrips.source,
  };
}

function buildBlock(
  platform: ShiftPlatformName,
  trips: ApiShiftTrip[],
  activity?: ShiftActivityDto | null,
): PlatformBlock {
  const lines = trips.map(tripToLine);
  return {
    platform,
    viajes: trips.length,
    trips: lines,
    total: sumTripsFromApi(trips, `Total ${platform}`),
    activity: mergeActivityFromTrips(trips, activity),
    pendingPaymentTripIds: trips
      .filter((t) =>
        tripNeedsPaymentUiAttention({
          netAmountCents: parseCents(t.netAmountCents),
          paymentMethod: t.paymentMethod,
          cashPaymentCents: parseOptionalCents(t.cashPaymentCents),
          cardPaymentCents: parseOptionalCents(t.cardPaymentCents),
          appPaymentCents: parseOptionalCents(t.appPaymentCents),
          paymentValidated: t.paymentValidated,
          grossAmountCents: parseOptionalCents(t.grossAmountCents),
        }),
      )
      .map((t) => t.id),
  };
}

export function mapTripsToRowDetail(
  trips: ApiShiftTrip[],
  fechaLabel: string,
  filterPlatform?: ShiftPlatformName,
  activity?: ShiftActivityDto | null,
): RowDetail {
  const byPlatform = new Map<RidePlatform, ApiShiftTrip[]>();
  for (const trip of trips) {
    const list = byPlatform.get(trip.platform) ?? [];
    list.push(trip);
    byPlatform.set(trip.platform, list);
  }

  const platforms: PlatformBlock[] = [];
  for (const [platform, list] of byPlatform.entries()) {
    const name = platformLabel(platform);
    if (filterPlatform && name !== filterPlatform) continue;
    platforms.push(buildBlock(name, list, activity));
  }

  return { fechaLabel, platforms };
}
