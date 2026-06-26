import type { NormalizedTripUpsert } from "@fleethub/contracts";
import {
  fetchAllUberPartnerPayments,
  fetchAllUberPartnerTrips,
  resolveUberDriverAccessToken,
} from "./uber-driver-client.js";
import { mergeUberDriverTripUpserts, uberPartnerPaymentsToUpserts, uberPartnerTripsToUpserts } from "./uber-driver-mappers.js";

export type UberDriverSyncResult =
  | { ok: true; data: NormalizedTripUpsert[]; paymentsCount: number; tripsCount: number }
  | { ok: false; message: string };

/**
 * Sync trips via Driver API (GET /partners/trips + /partners/payments).
 * Requires driver OAuth token — not fleet client_credentials.
 *
 * Note: Uber returns empty payments[] for drivers under a fleet manager.
 */
export async function syncUberTripsViaDriverApi(args: {
  from: Date;
  to: Date;
  accessToken?: string;
}): Promise<UberDriverSyncResult> {
  const token =
    args.accessToken != null
      ? { ok: true as const, data: args.accessToken }
      : await resolveUberDriverAccessToken();
  if (!token.ok) return token;

  const fromSec = Math.floor(args.from.getTime() / 1000);
  const toSec = Math.floor(args.to.getTime() / 1000);

  const [tripsRes, paymentsRes] = await Promise.all([
    fetchAllUberPartnerTrips(token.data, { from_time: fromSec, to_time: toSec }),
    fetchAllUberPartnerPayments(token.data, { from_time: fromSec, to_time: toSec }),
  ]);

  if (!tripsRes.ok) return tripsRes;

  const tripUpserts = uberPartnerTripsToUpserts(tripsRes.data);
  let paymentUpserts: NormalizedTripUpsert[] = [];

  if (paymentsRes.ok) {
    paymentUpserts = uberPartnerPaymentsToUpserts(paymentsRes.data);
    if (paymentsRes.data.length === 0 && tripUpserts.length > 0) {
      console.warn(
        "[uber] Driver API: payments[] empty — common for fleet-managed drivers (use Vehicle Suppliers API).",
      );
    }
  } else {
    console.warn("[uber] Driver API payments:", paymentsRes.message);
  }

  return {
    ok: true,
    data: mergeUberDriverTripUpserts(tripUpserts, paymentUpserts),
    paymentsCount: paymentsRes.ok ? paymentsRes.data.length : 0,
    tripsCount: tripsRes.data.length,
  };
}
