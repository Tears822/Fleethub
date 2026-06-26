import type { ApiShiftTrip } from "@/features/shifts/lib/shift-trip-detail-mapper";
import { buildShiftTripsQueryParams } from "@/features/shifts/lib/shift-trips-query";
import type { CerrarTurnosRow } from "@/features/shifts/ui/cerrar-turnos-types";
import { buildApiUrl } from "@/shared/lib/api-url";
import { formatDateTimeInTenantTz } from "@/shared/lib/tenant-timezone";
import type { RidePlatform } from "@prisma/client";

function parseCents(value: string | null): bigint {
  if (!value) return BigInt(0);
  try {
    return BigInt(value);
  } catch {
    return BigInt(0);
  }
}

export function formatShiftTripDateTime(iso: string): string {
  return formatDateTimeInTenantTz(iso);
}

export function shiftTripPaymentLabel(method: string | null): string {
  if (!method) return "—";
  const m = method.toLowerCase();
  if (m.includes("cash") || m.includes("efectivo")) return "Efectivo";
  if (m.includes("card") || m.includes("tarjeta")) return "Tarjeta";
  if (m.includes("app")) return "App";
  return method;
}

export function shiftTripAmountLabel(trip: ApiShiftTrip): string {
  const gross = parseCents(trip.grossAmountCents);
  const net = parseCents(trip.netAmountCents);
  const cents = gross > BigInt(0) ? gross : net;
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(cents) / 100);
}

export function tripIdsForClose(row: CerrarTurnosRow, platform?: RidePlatform): string[] {
  if (!platform) return row.tripIds ?? [];
  return row.tripIdsByPlatform?.[platform] ?? [];
}

export function sortTripsChronologically(trips: ApiShiftTrip[]): ApiShiftTrip[] {
  return [...trips].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );
}

export function tripEndTime(trip: ApiShiftTrip): Date {
  return new Date(trip.endedAt ?? trip.startedAt);
}

export type ShiftCloseTripRange = {
  timeFrom: Date;
  timeTo: Date;
  includedCount: number;
};

/** Inclusive range: first trip start through selected trip end. */
export function rangeThroughTripIndex(
  trips: ApiShiftTrip[],
  selectedIndex: number,
): ShiftCloseTripRange | null {
  if (trips.length === 0 || selectedIndex < 0 || selectedIndex >= trips.length) return null;
  const slice = trips.slice(0, selectedIndex + 1);
  const timeFrom = new Date(slice[0]!.startedAt);
  const last = slice[slice.length - 1]!;
  const timeTo = tripEndTime(last);
  return { timeFrom, timeTo, includedCount: slice.length };
}

export async function fetchPendingShiftTrips(
  row: CerrarTurnosRow,
  platform?: RidePlatform,
  signal?: AbortSignal,
): Promise<ApiShiftTrip[]> {
  const tripIds = tripIdsForClose(row, platform);
  if (!row.driverId) return [];

  const params = buildShiftTripsQueryParams({
    liquidationStatus: "pending",
    driverId: row.driverId,
    tripIds,
    platform,
  });
  if (!params) return [];

  params.set("includeActivity", "0");

  const res = await fetch(buildApiUrl(`/api/tenant/shifts/trips?${params}`), {
    credentials: "include",
    signal,
  });
  const data = (await res.json()) as { error?: string; trips?: ApiShiftTrip[] };
  if (!res.ok) {
    throw new Error(data.error ?? "No se pudieron cargar los viajes.");
  }
  if (!data.trips?.length) return [];

  let trips = data.trips;
  if (platform) {
    trips = trips.filter((t) => t.platform === platform);
  }
  return sortTripsChronologically(trips);
}
