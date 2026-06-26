import { displayNameToRidePlatform } from "@/features/shifts/lib/shift-platform";
import type { ShiftPlatformName } from "@/features/shifts/ui/cerrar-turnos-types";
import type { RidePlatform } from "@prisma/client";

/** Max trip IDs in GET query — long UUID lists break proxies and browsers. */
export const SHIFT_TRIPS_QUERY_TRIP_IDS_MAX = 80;

export function buildShiftTripsQueryParams(input: {
  liquidationStatus: "pending" | "closed";
  driverId?: string;
  tripIds?: string[];
  platform?: RidePlatform;
  filterPlatformName?: ShiftPlatformName;
}): URLSearchParams | null {
  const params = new URLSearchParams();
  params.set("status", input.liquidationStatus);

  const ridePlatform =
    input.platform ??
    (input.filterPlatformName
      ? displayNameToRidePlatform(input.filterPlatformName) ?? undefined
      : undefined);
  if (ridePlatform) params.set("platform", ridePlatform);

  const tripIds = input.tripIds ?? [];
  const scopedByPlatform = Boolean(ridePlatform);

  if (input.driverId && input.liquidationStatus === "pending") {
    params.set("driverId", input.driverId);
    if (
      !scopedByPlatform &&
      tripIds.length > 0 &&
      tripIds.length <= SHIFT_TRIPS_QUERY_TRIP_IDS_MAX
    ) {
      params.set("tripIds", tripIds.join(","));
    }
    return params;
  }

  if (!tripIds.length && !input.driverId) return null;

  if (input.driverId) params.set("driverId", input.driverId);
  if (tripIds.length) {
    if (tripIds.length > SHIFT_TRIPS_QUERY_TRIP_IDS_MAX) {
      return null;
    }
    params.set("tripIds", tripIds.join(","));
  }
  return params;
}
