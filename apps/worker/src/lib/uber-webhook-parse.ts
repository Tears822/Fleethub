import type { NormalizedTripUpsert } from "@fleethub/contracts";
import type { UberPartnerTrip } from "./uber-driver-client.js";
import { uberPartnerTripsToUpserts } from "./uber-driver-mappers.js";
import { mapUberFareTypeFromLabel } from "./uber-fare-type.js";

export type UberWebhookParseResult = {
  eventId: string | null;
  eventType: string | null;
  externalDriverId: string | null;
  trips: NormalizedTripUpsert[];
  ignored: boolean;
  ignoreReason?: string;
};

function readString(o: Record<string, unknown>, key: string): string | null {
  const v = o[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function eventTimeToIso(eventTime: unknown): string | null {
  if (typeof eventTime === "number" && Number.isFinite(eventTime)) {
    const ms = eventTime > 1e12 ? eventTime : eventTime * 1000;
    return new Date(ms).toISOString();
  }
  return null;
}

function isCompletedStatus(status: string | null): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return s === "completed" || s.includes("complete") || s === "driver_completed";
}

function extractDriverId(body: Record<string, unknown>, meta: Record<string, unknown>): string | null {
  return (
    readString(body, "driver_id") ??
    readString(meta, "driver_id") ??
    readString(meta, "user_id") ??
    readString(meta, "earner_id") ??
    null
  );
}

function extractTripId(
  body: Record<string, unknown>,
  meta: Record<string, unknown>,
): string | null {
  return (
    readString(meta, "resource_id") ??
    readString(body, "trip_id") ??
    readString(meta, "trip_id") ??
    null
  );
}

function tripFromEmbedded(raw: unknown): NormalizedTripUpsert[] {
  if (!raw || typeof raw !== "object") return [];
  return uberPartnerTripsToUpserts([raw as UberPartnerTrip]);
}

function minimalTripFromEvent(
  tripId: string,
  whenIso: string,
  status: string | null,
  meta: Record<string, unknown>,
): NormalizedTripUpsert | null {
  if (!isCompletedStatus(status)) return null;
  const productHint =
    readString(meta, "product_type") ??
    readString(meta, "vehicle_view_type") ??
    readString(meta, "service_type");
  return {
    externalTripId: tripId,
    startedAt: whenIso,
    endedAt: whenIso,
    paymentMethod: "app",
    paymentValidated: false,
    fareType: mapUberFareTypeFromLabel(productHint),
  };
}

/** Map Uber standard webhook envelope → normalized trips (best-effort). */
export function parseUberWebhookPayload(body: unknown): UberWebhookParseResult {
  if (!body || typeof body !== "object") {
    return {
      eventId: null,
      eventType: null,
      externalDriverId: null,
      trips: [],
      ignored: true,
      ignoreReason: "empty body",
    };
  }

  const o = body as Record<string, unknown>;
  const meta =
    o.meta && typeof o.meta === "object" ? (o.meta as Record<string, unknown>) : {};

  const eventId = readString(o, "event_id");
  const eventType = readString(o, "event_type");
  const externalDriverId = extractDriverId(o, meta);

  const trips: NormalizedTripUpsert[] = [];

  if (o.trip) {
    trips.push(...tripFromEmbedded(o.trip));
  }
  if (meta.trip) {
    trips.push(...tripFromEmbedded(meta.trip));
  }
  if (o.data && typeof o.data === "object") {
    const data = o.data as Record<string, unknown>;
    if (data.trip) trips.push(...tripFromEmbedded(data.trip));
  }

  if (trips.length === 0) {
    const tripId = extractTripId(o, meta);
    const status = readString(meta, "status");
    const whenIso = eventTimeToIso(o.event_time) ?? new Date().toISOString();
    if (tripId) {
      const minimal = minimalTripFromEvent(tripId, whenIso, status, meta);
      if (minimal) trips.push(minimal);
    }
  }

  const typeLower = (eventType ?? "").toLowerCase();
  if (
    trips.length === 0 &&
    (typeLower.includes("vehicle") ||
      typeLower.includes("driver_actioning") ||
      typeLower.includes("document"))
  ) {
    return {
      eventId,
      eventType,
      externalDriverId,
      trips: [],
      ignored: true,
      ignoreReason: `non-trip event: ${eventType}`,
    };
  }

  if (trips.length === 0) {
    return {
      eventId,
      eventType,
      externalDriverId,
      trips: [],
      ignored: true,
      ignoreReason: eventType ? `no trip extracted for ${eventType}` : "no trip data",
    };
  }

  const byId = new Map<string, NormalizedTripUpsert>();
  for (const t of trips) {
    byId.set(t.externalTripId, t);
  }

  return {
    eventId,
    eventType,
    externalDriverId,
    trips: [...byId.values()],
    ignored: false,
  };
}
