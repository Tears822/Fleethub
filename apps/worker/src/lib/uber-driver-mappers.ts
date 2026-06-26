import type { NormalizedTripUpsert } from "@fleethub/contracts";
import type { UberPartnerPayment, UberPartnerTrip } from "./uber-driver-client.js";
import { mapUberPartnerTripFareType, uberFareTypeMergeScore } from "./uber-fare-type.js";

function preferPositiveCents(
  incoming: bigint | null | undefined,
  existing: bigint | null | undefined,
): bigint | null {
  const i = incoming != null && incoming > BigInt(0) ? incoming : null;
  const e = existing != null && existing > BigInt(0) ? existing : null;
  if (i != null && e != null) return i > e ? i : e;
  return i ?? e ?? incoming ?? existing ?? null;
}

function pickFareType(
  a: string | null | undefined,
  b: string | null | undefined,
): string | null {
  const sa = uberFareTypeMergeScore(a);
  const sb = uberFareTypeMergeScore(b);
  if (sa > sb) return a?.trim() || b?.trim() || null;
  return b?.trim() || a?.trim() || null;
}

function dollarsToCents(amount: number): bigint {
  return BigInt(Math.round(Math.abs(amount) * 100));
}

function tsToIso(sec: number | undefined): string | null {
  if (sec == null || !Number.isFinite(sec)) return null;
  return new Date(sec * 1000).toISOString();
}

function pickupTimestamp(t: UberPartnerTrip): number | undefined {
  return t.pickup?.timestamp ?? t.status_changes?.find((s) => s.status === "trip_began")?.timestamp;
}

function dropoffTimestamp(t: UberPartnerTrip): number | undefined {
  return (
    t.dropoff?.timestamp ??
    t.drop_off?.timestamp ??
    t.status_changes?.find((s) => s.status === "completed")?.timestamp
  );
}

/** GET /partners/trips → trip upserts (completed trips with fare when present). */
export function uberPartnerTripsToUpserts(trips: UberPartnerTrip[]): NormalizedTripUpsert[] {
  const out: NormalizedTripUpsert[] = [];

  for (const t of trips) {
    const tripId = t.trip_id?.trim();
    if (!tripId) continue;

    const status = (t.status ?? "").toLowerCase();
    if (status && status !== "completed" && !status.includes("complete")) {
      continue;
    }

    const startSec = pickupTimestamp(t);
    const endSec = dropoffTimestamp(t) ?? startSec;
    if (!startSec) continue;

    const fareCents = t.fare != null ? dollarsToCents(t.fare) : null;
    const tollCents =
      t.breakdown?.toll != null ? dollarsToCents(t.breakdown.toll) : BigInt(0);

    out.push({
      externalTripId: tripId,
      startedAt: tsToIso(startSec)!,
      endedAt: tsToIso(endSec) ?? tsToIso(startSec)!,
      grossAmountCents: fareCents,
      platformFeeCents: null,
      tipCents: BigInt(0),
      tollCents,
      netAmountCents: fareCents,
      paymentMethod: "app",
      paymentValidated: true,
      fareType: mapUberPartnerTripFareType(t),
    });
  }

  return out;
}

/** GET /partners/payments — fare rows with trip_id (net amount per doc). */
export function uberPartnerPaymentsToUpserts(
  payments: UberPartnerPayment[],
): NormalizedTripUpsert[] {
  const byTrip = new Map<string, UberPartnerPayment>();

  for (const p of payments) {
    const tripId = p.trip_id?.trim();
    if (!tripId || p.category !== "fare") continue;
    const existing = byTrip.get(tripId);
    if (!existing || (p.event_time ?? 0) >= (existing.event_time ?? 0)) {
      byTrip.set(tripId, p);
    }
  }

  const out: NormalizedTripUpsert[] = [];
  for (const [tripId, p] of byTrip) {
    const eventSec = p.event_time ?? Math.floor(Date.now() / 1000);
    const at = tsToIso(eventSec)!;
    const net = p.amount != null ? dollarsToCents(p.amount) : null;
    const serviceFee =
      p.breakdown?.service_fee != null
        ? dollarsToCents(Math.abs(p.breakdown.service_fee))
        : null;
    const toll =
      p.breakdown?.toll != null ? dollarsToCents(p.breakdown.toll) : BigInt(0);

    out.push({
      externalTripId: tripId,
      startedAt: at,
      endedAt: at,
      grossAmountCents: net,
      platformFeeCents: serviceFee,
      tipCents: BigInt(0),
      tollCents: toll,
      netAmountCents: net,
      paymentMethod: p.cash_collected && p.cash_collected > 0 ? "cash" : "app",
      paymentValidated: true,
      fareType: p.category ?? "fare",
    });
  }

  return out;
}

/** Merge trip history + payments (trips win on times; payments enrich amounts). */
export function mergeUberDriverTripUpserts(
  trips: NormalizedTripUpsert[],
  payments: NormalizedTripUpsert[],
): NormalizedTripUpsert[] {
  const byId = new Map<string, NormalizedTripUpsert>();
  for (const t of trips) {
    byId.set(t.externalTripId, t);
  }
  for (const p of payments) {
    const existing = byId.get(p.externalTripId);
    if (!existing) {
      byId.set(p.externalTripId, p);
      continue;
    }
    byId.set(p.externalTripId, {
      ...existing,
      grossAmountCents: preferPositiveCents(p.grossAmountCents, existing.grossAmountCents),
      netAmountCents: preferPositiveCents(p.netAmountCents, existing.netAmountCents),
      platformFeeCents: preferPositiveCents(p.platformFeeCents, existing.platformFeeCents),
      tipCents: preferPositiveCents(p.tipCents, existing.tipCents) ?? BigInt(0),
      tollCents: preferPositiveCents(p.tollCents, existing.tollCents) ?? BigInt(0),
      cashPaymentCents: preferPositiveCents(p.cashPaymentCents, existing.cashPaymentCents),
      cardPaymentCents: preferPositiveCents(p.cardPaymentCents, existing.cardPaymentCents),
      appPaymentCents: preferPositiveCents(p.appPaymentCents, existing.appPaymentCents),
      paymentMethod: p.paymentMethod ?? existing.paymentMethod,
      fareType: pickFareType(p.fareType, existing.fareType),
    });
  }
  return [...byId.values()];
}
