import type { NormalizedTripUpsert } from "@fleethub/contracts";
import { freenowBookingToUpsert } from "./freenow-booking-mapper.js";
import type { FreenowBooking } from "./freenow-sdk.js";
import { isFreenowPublicDriverId } from "./freenow-link-drivers.js";

export function normalizeFreenowDriverName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function freenowBookingDriverName(booking: FreenowBooking): string {
  const driver = booking.driver as { name?: string; firstName?: string; lastName?: string } | undefined;
  if (!driver) return "";
  if (driver.name?.trim()) return driver.name.trim();
  const parts = [driver.firstName, driver.lastName].filter((p) => p?.trim());
  return parts.join(" ").trim();
}

export function freenowBookingPublicDriverId(booking: FreenowBooking): string | null {
  const id = booking.driver?.id?.trim();
  return id && id.length > 0 ? id : null;
}

/** Match accomplished bookings to a FleetHub driver when spreadsheet short codes do not match API ids. */
export function extractFreenowTripsFromBookingsByDriverName(
  bookings: FreenowBooking[],
  driverFullName: string,
): { trips: NormalizedTripUpsert[]; publicDriverId: string | null } {
  const target = normalizeFreenowDriverName(driverFullName);
  if (!target) return { trips: [], publicDriverId: null };

  const trips: NormalizedTripUpsert[] = [];
  let publicDriverId: string | null = null;

  for (const booking of bookings) {
    const bookingName = normalizeFreenowDriverName(freenowBookingDriverName(booking));
    if (!bookingName || bookingName !== target) continue;
    const upsert = freenowBookingToUpsert(booking);
    if (!upsert) continue;
    trips.push(upsert);
    if (!publicDriverId) {
      publicDriverId = freenowBookingPublicDriverId(booking);
    }
  }

  return { trips, publicDriverId };
}

export function resolveFreenowTripsForDriverAccount(input: {
  externalDriverId: string;
  driverFullName: string;
  tripsByDriver: Map<string, NormalizedTripUpsert[]>;
  bookings: FreenowBooking[];
}): { trips: NormalizedTripUpsert[]; publicDriverId: string | null } {
  const ext = input.externalDriverId.trim();
  const byId = input.tripsByDriver.get(ext) ?? [];
  if (byId.length > 0) {
    return { trips: byId, publicDriverId: isFreenowPublicDriverId(ext) ? ext : null };
  }

  if (!isFreenowPublicDriverId(ext)) {
    return extractFreenowTripsFromBookingsByDriverName(input.bookings, input.driverFullName);
  }

  return { trips: [], publicDriverId: null };
}
