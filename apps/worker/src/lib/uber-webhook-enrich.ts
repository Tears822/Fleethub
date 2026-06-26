import type { NormalizedTripUpsert } from "@fleethub/contracts";
import { uberFleetGet } from "./uber-fleet-client.js";
import type { UberPartnerTrip } from "./uber-driver-client.js";
import { mergeUberDriverTripUpserts, uberPartnerTripsToUpserts } from "./uber-driver-mappers.js";
import { syncUberTripsViaReports } from "./uber-reports.js";

export function tripNeedsEnrichment(t: NormalizedTripUpsert): boolean {
  return t.grossAmountCents == null && t.netAmountCents == null;
}

export function extractUberResourceHref(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const href = o.resource_href;
  return typeof href === "string" && href.trim() ? href.trim() : null;
}

function pathFromResourceHref(href: string): string | null {
  try {
    const u = new URL(href);
    return `${u.pathname}${u.search}`;
  } catch {
    return href.startsWith("/") ? href : null;
  }
}

function upsertFromResourcePayload(
  data: unknown,
  expectedTripId: string,
): NormalizedTripUpsert | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;

  const candidates: unknown[] = [o, o.trip, o.data, o.request, o.trip_details];
  for (const raw of candidates) {
    if (!raw || typeof raw !== "object") continue;
    const upserts = uberPartnerTripsToUpserts([raw as UberPartnerTrip]);
    const match = upserts.find((t) => t.externalTripId === expectedTripId);
    if (match) return match;
    if (upserts.length === 1) return upserts[0]!;
  }

  const tripId =
    (typeof o.trip_id === "string" && o.trip_id) ||
    (typeof o.uuid === "string" && o.uuid) ||
    null;
  if (tripId === expectedTripId) {
    const upserts = uberPartnerTripsToUpserts([o as UberPartnerTrip]);
    return upserts[0] ?? null;
  }

  return null;
}

async function fetchTripFromResourceHref(
  href: string,
  tripId: string,
): Promise<NormalizedTripUpsert | null> {
  const path = pathFromResourceHref(href);
  if (!path) return null;

  const res = await uberFleetGet<unknown>(path);
  if (!res.ok) {
    console.warn(`[uber] webhook resource_href GET failed: ${res.message}`);
    return null;
  }

  return upsertFromResourcePayload(res.data, tripId);
}

function reportsEnrichEnabled(): boolean {
  const v = process.env.WEBHOOK_UBER_ENRICH_REPORTS?.trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "no";
}

async function fetchTripsFromReports(args: {
  tenantId: string;
  externalDriverId: string;
  tripIds: string[];
}): Promise<Map<string, NormalizedTripUpsert>> {
  const out = new Map<string, NormalizedTripUpsert>();
  if (!reportsEnrichEnabled() || args.tripIds.length === 0) return out;

  const to = new Date();
  const from = new Date(to.getTime() - 48 * 60 * 60 * 1000);

  const report = await syncUberTripsViaReports({
    tenantId: args.tenantId,
    driverId: args.externalDriverId,
    from,
    to,
  });

  if (!report.ok) {
    console.warn(`[uber] webhook report enrich: ${report.message}`);
    return out;
  }

  for (const t of report.data) {
    if (args.tripIds.includes(t.externalTripId)) {
      out.set(t.externalTripId, t);
    }
  }
  return out;
}

function mergeTrip(base: NormalizedTripUpsert, full: NormalizedTripUpsert): NormalizedTripUpsert {
  return mergeUberDriverTripUpserts([base], [full])[0] ?? base;
}

/**
 * Enrich minimal webhook trips via Uber `resource_href` GET, then Trip Activity report fallback.
 */
export async function enrichUberWebhookTrips(args: {
  tenantId: string;
  externalDriverId: string;
  trips: NormalizedTripUpsert[];
  body: unknown;
}): Promise<{ trips: NormalizedTripUpsert[]; enrichedVia: "resource_href" | "reports" | null }> {
  const needs = args.trips.filter(tripNeedsEnrichment);
  if (needs.length === 0) {
    return { trips: args.trips, enrichedVia: null };
  }

  const resourceHref = extractUberResourceHref(args.body);
  let enrichedVia: "resource_href" | "reports" | null = null;
  const byId = new Map(args.trips.map((t) => [t.externalTripId, t]));

  if (resourceHref) {
    for (const tripId of needs.map((t) => t.externalTripId)) {
      const full = await fetchTripFromResourceHref(resourceHref, tripId);
      if (full) {
        const base = byId.get(tripId);
        if (base) byId.set(tripId, mergeTrip(base, full));
        enrichedVia = "resource_href";
      }
    }
  }

  const stillNeeds = [...byId.values()].filter(tripNeedsEnrichment);
  if (stillNeeds.length > 0) {
    const fromReports = await fetchTripsFromReports({
      tenantId: args.tenantId,
      externalDriverId: args.externalDriverId,
      tripIds: stillNeeds.map((t) => t.externalTripId),
    });
    if (fromReports.size > 0) {
      enrichedVia = enrichedVia ?? "reports";
      for (const [tripId, full] of fromReports) {
        const base = byId.get(tripId);
        if (base) byId.set(tripId, mergeTrip(base, full));
      }
    }
  }

  return { trips: [...byId.values()], enrichedVia };
}
