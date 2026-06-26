import type { NormalizedTripUpsert } from "@fleethub/contracts";
import { enrichFreenowTripsWithDriverEarnings } from "./freenow-earnings-mapper.js";
import { syncFreenowTripsForDriver } from "./freenow-bookings.js";

/** Bookings sync + driver earnings enrichment (commission / primas). */
export async function syncFreenowTripsForDriverEnriched(params: {
  publicCompanyId: string;
  publicDriverId: string;
  from: Date;
  to: Date;
}): Promise<
  | { ok: true; trips: NormalizedTripUpsert[]; earningsEnriched: boolean }
  | { ok: false; message: string }
> {
  const synced = await syncFreenowTripsForDriver(params);
  if (!synced.ok) {
    return synced;
  }

  const enriched = await enrichFreenowTripsWithDriverEarnings({
    publicCompanyId: params.publicCompanyId,
    publicDriverId: params.publicDriverId,
    from: params.from,
    to: params.to,
    trips: synced.trips,
  });

  if (enriched.message && !enriched.enriched) {
    console.warn(
      `[freenow] earnings skip driver=${params.publicDriverId.slice(0, 8)}…: ${enriched.message}`,
    );
  }

  return {
    ok: true,
    trips: enriched.trips,
    earningsEnriched: enriched.enriched,
  };
}
