import { resolveFreenowNumericCompanyId } from "./freenow-company-id.js";
import { freenowBookingToUpsert } from "./freenow-booking-mapper.js";
import type { FreenowBooking } from "./freenow-sdk.js";
import { freenowSdkCall } from "./freenow-sdk.js";
import type { NormalizedTripUpsert } from "@fleethub/contracts";

export async function listFreenowCompanyBookings(params: {
  publicCompanyId: string;
  from: Date;
  to: Date;
  pageSize?: number;
}): Promise<
  | { ok: true; bookings: FreenowBooking[] }
  | { ok: false; message: string }
> {
  const companyId = resolveFreenowNumericCompanyId(params.publicCompanyId);

  const pageSize = params.pageSize ?? 50;
  const all: FreenowBooking[] = [];
  let page = 0;
  let totalPages = 1;

  while (page < totalPages) {
    const result = await freenowSdkCall("getCompanyBookings", (sdk) =>
      sdk.getCompanyBookings({
        publicCompanyId: params.publicCompanyId,
        from: params.from.toISOString(),
        to: params.to.toISOString(),
        page,
        size: pageSize,
        ...(companyId != null ? { companyId } : {}),
      } as Parameters<typeof sdk.getCompanyBookings>[0]),
    );
    if (!result.ok) {
      return result;
    }
    const content = result.data.content ?? [];
    all.push(...content);
    totalPages = result.data.metadata?.totalPages ?? page + 1;
    if (content.length === 0) break;
    page += 1;
  }

  return { ok: true, bookings: all };
}

/** Group ACCOMPLISHED bookings into trip upserts keyed by public driver id. */
export function buildFreenowTripsByDriver(
  bookings: FreenowBooking[],
): Map<string, NormalizedTripUpsert[]> {
  const tripsByDriver = new Map<string, NormalizedTripUpsert[]>();
  for (const b of bookings) {
    const publicDriverId = b.driver?.id?.trim();
    if (!publicDriverId) continue;
    const upsert = freenowBookingToUpsert(b);
    if (!upsert) continue;
    const list = tripsByDriver.get(publicDriverId) ?? [];
    list.push(upsert);
    tripsByDriver.set(publicDriverId, list);
  }
  return tripsByDriver;
}

/** One getCompanyBookings pass for all drivers in the sync window. */
export async function fetchFreenowTripsByDriver(params: {
  publicCompanyId: string;
  from: Date;
  to: Date;
}): Promise<
  | {
      ok: true;
      tripsByDriver: Map<string, NormalizedTripUpsert[]>;
      bookingCount: number;
      bookings: FreenowBooking[];
    }
  | { ok: false; message: string }
> {
  const bookings = await listFreenowCompanyBookings(params);
  if (!bookings.ok) {
    return bookings;
  }
  return {
    ok: true,
    tripsByDriver: buildFreenowTripsByDriver(bookings.bookings),
    bookingCount: bookings.bookings.length,
    bookings: bookings.bookings,
  };
}

/** Fetch bookings for all umbrella-linked FreeNow companies and merge by driver id. */
export async function fetchFreenowTripsByDriverMultiCompany(params: {
  publicCompanyIds: string[];
  from: Date;
  to: Date;
}): Promise<
  | {
      ok: true;
      tripsByDriver: Map<string, NormalizedTripUpsert[]>;
      bookingCount: number;
      bookings: FreenowBooking[];
    }
  | { ok: false; message: string }
> {
  const tripsByDriver = new Map<string, NormalizedTripUpsert[]>();
  const bookings: FreenowBooking[] = [];
  let bookingCount = 0;
  let failures = 0;

  for (const publicCompanyId of params.publicCompanyIds) {
    const batch = await fetchFreenowTripsByDriver({
      publicCompanyId,
      from: params.from,
      to: params.to,
    });
    if (!batch.ok) {
      failures += 1;
      console.warn(`[freenow] bookings ${publicCompanyId}: ${batch.message}`);
      continue;
    }
    bookingCount += batch.bookingCount;
    bookings.push(...batch.bookings);
    for (const [driverId, trips] of batch.tripsByDriver) {
      const list = tripsByDriver.get(driverId) ?? [];
      list.push(...trips);
      tripsByDriver.set(driverId, list);
    }
  }

  if (bookingCount === 0 && failures === params.publicCompanyIds.length) {
    return { ok: false, message: "No FreeNow bookings fetched for any linked company." };
  }

  return { ok: true, tripsByDriver, bookingCount, bookings };
}

export async function syncFreenowTripsForDriver(params: {
  publicCompanyId: string;
  publicDriverId: string;
  from: Date;
  to: Date;
}): Promise<
  | { ok: true; trips: NormalizedTripUpsert[] }
  | { ok: false; message: string }
> {
  const batch = await fetchFreenowTripsByDriver({
    publicCompanyId: params.publicCompanyId,
    from: params.from,
    to: params.to,
  });
  if (!batch.ok) {
    return batch;
  }
  return {
    ok: true,
    trips: batch.tripsByDriver.get(params.publicDriverId) ?? [],
  };
}
