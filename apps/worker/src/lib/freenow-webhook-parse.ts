import type { NormalizedTripUpsert } from "@fleethub/contracts";
import { freenowBookingToUpsert } from "./freenow-booking-mapper.js";
import type { FreenowBooking } from "./freenow-sdk.js";

export type FreenowWebhookParseResult = {
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

function looksLikeFreenowBooking(raw: unknown): raw is FreenowBooking {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  return typeof o.id === "string" && ("state" in o || "pickupDate" in o);
}

function extractBooking(body: Record<string, unknown>): FreenowBooking | null {
  const candidates: unknown[] = [body.booking, body.data, body.payload, body];
  for (const raw of candidates) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    if (looksLikeFreenowBooking(o)) return o;
    if (o.booking && looksLikeFreenowBooking(o.booking)) {
      return o.booking;
    }
  }
  return null;
}

function driverIdFromBooking(booking: FreenowBooking): string | null {
  return booking.driver?.id?.trim() ?? null;
}

/** FreeNow webhook → booking upsert when payload matches company booking shape. */
export function parseFreenowWebhookPayload(body: unknown): FreenowWebhookParseResult {
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
  const eventType =
    readString(o, "event_type") ??
    readString(o, "type") ??
    readString(o, "eventType") ??
    null;
  const eventId =
    readString(o, "event_id") ??
    readString(o, "eventId") ??
    readString(o, "id") ??
    null;

  const booking = extractBooking(o);
  if (booking) {
    const upsert = freenowBookingToUpsert(booking);
    const externalDriverId =
      driverIdFromBooking(booking) ??
      readString(o, "driver_id") ??
      readString(o, "driverId") ??
      null;

    if (!upsert) {
      return {
        eventId: eventId ?? booking.id ?? null,
        eventType,
        externalDriverId,
        trips: [],
        ignored: true,
        ignoreReason: `booking state ${booking.state ?? "unknown"} (not ACCOMPLISHED)`,
      };
    }

    return {
      eventId: eventId ?? booking.id ?? null,
      eventType,
      externalDriverId,
      trips: [upsert],
      ignored: false,
    };
  }

  return {
    eventId,
    eventType,
    externalDriverId:
      readString(o, "driver_id") ??
      readString(o, "driverId") ??
      null,
    trips: [],
    ignored: true,
    ignoreReason: "no FreeNow booking object in payload",
  };
}
