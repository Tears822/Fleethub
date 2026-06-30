import type { ApiShiftTrip } from "@/features/shifts/lib/shift-trip-detail-mapper";
import { buildShiftTripsQueryParams, SHIFT_TRIPS_QUERY_TRIP_IDS_MAX } from "@/features/shifts/lib/shift-trips-query";
import type { ShiftLiveDetailInput, ShiftPlatformName } from "@/features/shifts/ui/cerrar-turnos-types";
import type { ShiftActivityDto } from "@fleethub/auth/shift-activity";
import { buildApiUrl } from "@/shared/lib/api-url";
import { displayNameToRidePlatform } from "@/features/shifts/lib/shift-platform";

export type ShiftTripsDetailResponse = {
  trips: ApiShiftTrip[];
  activity: ShiftActivityDto | null;
};

function tripIdsTooLargeForGet(tripIds: string[]): boolean {
  return tripIds.length > SHIFT_TRIPS_QUERY_TRIP_IDS_MAX;
}

/** Loads shift trip detail via GET (small batches) or POST (large closed liquidations). */
export async function fetchShiftTripsDetail(
  live: ShiftLiveDetailInput,
  filterPlatform?: ShiftPlatformName,
  signal?: AbortSignal,
): Promise<ShiftTripsDetailResponse> {
  const params = buildShiftTripsQueryParams({
    liquidationStatus: live.liquidationStatus,
    driverId: live.driverId,
    tripIds: live.tripIds,
    filterPlatformName: filterPlatform,
  });

  if (params) {
    const res = await fetch(buildApiUrl(`/api/tenant/shifts/trips?${params}`), {
      credentials: "include",
      signal,
    });
    const data = (await res.json()) as {
      error?: string;
      trips?: ApiShiftTrip[];
      activity?: ShiftActivityDto | null;
    };
    if (!res.ok) {
      throw new Error(data.error ?? "No se pudieron cargar los viajes del turno.");
    }
    if (!data.trips?.length) {
      throw new Error("No hay viajes para mostrar en este detalle.");
    }
    return { trips: data.trips, activity: data.activity ?? null };
  }

  if (
    live.liquidationStatus !== "closed" ||
    !live.tripIds.length ||
    !tripIdsTooLargeForGet(live.tripIds)
  ) {
    throw new Error("Demasiados viajes para cargar en una sola petición. Use cerrar por franja.");
  }

  const platform = filterPlatform ? displayNameToRidePlatform(filterPlatform) ?? undefined : undefined;
  const res = await fetch(buildApiUrl("/api/tenant/shifts/trips"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status: live.liquidationStatus,
      driverId: live.driverId,
      tripIds: live.tripIds,
      platform,
    }),
    signal,
  });
  const data = (await res.json()) as {
    error?: string;
    trips?: ApiShiftTrip[];
    activity?: ShiftActivityDto | null;
  };
  if (!res.ok) {
    throw new Error(data.error ?? "No se pudieron cargar los viajes del turno.");
  }
  if (!data.trips?.length) {
    throw new Error("No hay viajes para mostrar en este detalle.");
  }
  return { trips: data.trips, activity: data.activity ?? null };
}
