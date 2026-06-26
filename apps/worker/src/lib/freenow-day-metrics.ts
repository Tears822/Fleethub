import type { DriverDayMetrics } from "@fleethub/contracts";
import { computeDayMetricsFromTripSlices } from "@fleethub/auth";
import type { FreenowBooking } from "./freenow-sdk.js";

function utcDayOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function sameUtcDay(a: Date, b: Date): boolean {
  return utcDayOnly(a).getTime() === utcDayOnly(b).getTime();
}

function bookingReferenceDay(booking: FreenowBooking): Date | null {
  const raw = booking.pickupDate ?? booking.dropoffDate;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

const MAX_TRIP_MS = 24 * 60 * 60 * 1000;

/** FreeNow `routeDuration` is milliseconds (int64), not seconds. */
function bookingActiveMs(booking: FreenowBooking): number {
  if (booking.pickupDate && booking.dropoffDate) {
    const ms =
      new Date(booking.dropoffDate).getTime() - new Date(booking.pickupDate).getTime();
    if (ms >= 60_000 && ms <= MAX_TRIP_MS) return ms;
  }
  const rd = booking.routeDuration;
  if (typeof rd === "number" && rd >= 60_000 && rd <= MAX_TRIP_MS) {
    return rd;
  }
  return 0;
}

function tripSliceFromBooking(booking: FreenowBooking): { startedAt: Date; endedAt: Date | null } | null {
  if (!booking.pickupDate) return null;
  const startedAt = new Date(booking.pickupDate);
  if (Number.isNaN(startedAt.getTime())) return null;
  const activeMs = bookingActiveMs(booking);
  const endedAt =
    activeMs > 0
      ? new Date(startedAt.getTime() + activeMs)
      : booking.dropoffDate
        ? new Date(booking.dropoffDate)
        : null;
  return { startedAt, endedAt };
}

/** Day KPIs for one FreeNow driver from company bookings (FRD §6). */
export function computeFreenowDayMetrics(
  bookings: FreenowBooking[],
  publicDriverId: string,
  day: Date,
): DriverDayMetrics {
  const driverId = publicDriverId.trim();
  const dayUtc = utcDayOnly(day);

  let missed = 0;
  let rejected = 0;
  const accomplishedSlices: { startedAt: Date; endedAt: Date | null }[] = [];

  for (const b of bookings) {
    if (b.driver?.id?.trim() !== driverId) continue;
    const refDay = bookingReferenceDay(b);
    if (!refDay || !sameUtcDay(refDay, dayUtc)) continue;

    const state = b.state;
    if (state === "ACCOMPLISHED") {
      const slice = tripSliceFromBooking(b);
      if (slice) accomplishedSlices.push(slice);
      continue;
    }
    if (state === "CANCELED") {
      rejected += 1;
      continue;
    }
    if (state === "OFFER") {
      missed += 1;
    }
  }

  const fromTrips = computeDayMetricsFromTripSlices(accomplishedSlices);

  return {
    hoursOnline: fromTrips.hoursOnline,
    rejections: rejected,
    missed,
  };
}
