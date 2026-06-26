import type { NormalizedTripUpsert } from "@fleethub/contracts";
import type { UberPaymentRow } from "./uber-fleet-client.js";

function dollarsToCents(amount: number): bigint {
  return BigInt(Math.round(Math.abs(amount) * 100));
}

function signedDollarsToCents(amount: number): bigint {
  return BigInt(Math.round(amount * 100));
}

type TripPaymentAgg = {
  eventTime?: number;
  grossCents: bigint | null;
  feeCents: bigint | null;
  tipCents: bigint;
  tollCents: bigint;
  netCents: bigint | null;
  cashCents: bigint | null;
};

function categoryBucket(category: string | undefined): keyof TripPaymentAgg | null {
  const c = (category ?? "").toLowerCase();
  if (!c) return null;
  if (c.includes("tip")) return "tipCents";
  if (c.includes("toll")) return "tollCents";
  if (c.includes("service") || c.includes("fee") || c.includes("comision")) return "feeCents";
  if (c.includes("cash")) return "cashCents";
  if (c.includes("fare") || c.includes("trip") || c.includes("precio") || c === "payout") {
    return "grossCents";
  }
  return "netCents";
}

function addSignedAmount(current: bigint | null, delta: bigint): bigint {
  return (current ?? BigInt(0)) + delta;
}

/** Map Uber fleet payment rows with trip_id into trip upserts (near-real-time window). */
export function uberPaymentsToTripUpserts(payments: UberPaymentRow[]): NormalizedTripUpsert[] {
  const byTrip = new Map<string, TripPaymentAgg>();

  for (const p of payments) {
    const tripId = p.trip_id?.trim();
    if (!tripId || p.amount == null) continue;

    const agg = byTrip.get(tripId) ?? {
      grossCents: null,
      feeCents: null,
      tipCents: BigInt(0),
      tollCents: BigInt(0),
      netCents: null,
      cashCents: null,
    };

    if ((p.event_time ?? 0) >= (agg.eventTime ?? 0)) {
      agg.eventTime = p.event_time ?? agg.eventTime;
    }

    const bucket = categoryBucket(p.category);
    const cents = signedDollarsToCents(p.amount);
    const magnitude = cents < BigInt(0) ? -cents : cents;

    if (bucket === "feeCents") {
      agg.feeCents = addSignedAmount(agg.feeCents, magnitude);
    } else if (bucket === "tipCents") {
      agg.tipCents = addSignedAmount(agg.tipCents, magnitude);
    } else if (bucket === "tollCents") {
      agg.tollCents = addSignedAmount(agg.tollCents, magnitude);
    } else if (bucket === "cashCents") {
      agg.cashCents = addSignedAmount(agg.cashCents, magnitude);
    } else if (bucket === "grossCents") {
      agg.grossCents = addSignedAmount(agg.grossCents, magnitude);
      agg.netCents = addSignedAmount(agg.netCents, cents);
    } else {
      agg.netCents = addSignedAmount(agg.netCents, cents);
      if (agg.grossCents == null) {
        agg.grossCents = addSignedAmount(agg.grossCents, magnitude);
      }
    }

    byTrip.set(tripId, agg);
  }

  const out: NormalizedTripUpsert[] = [];
  for (const [tripId, agg] of byTrip) {
    const eventSec = agg.eventTime ?? Math.floor(Date.now() / 1000);
    const at = new Date(eventSec * 1000).toISOString();
    let net = agg.netCents;
    if (net == null && agg.grossCents != null) {
      net = agg.grossCents - (agg.feeCents ?? BigInt(0)) + agg.tipCents;
    }

    out.push({
      externalTripId: tripId,
      startedAt: at,
      endedAt: at,
      grossAmountCents: agg.grossCents,
      platformFeeCents: agg.feeCents,
      tipCents: agg.tipCents,
      tollCents: agg.tollCents,
      netAmountCents: net,
      cashPaymentCents: agg.cashCents,
      paymentMethod:
        agg.cashCents != null && agg.cashCents > BigInt(0) ? "cash" : "app",
      paymentValidated: true,
      fareType: "earners_payment",
    });
  }

  return out;
}
