/**
 * FRD §6 — driver day KPIs from trip windows (no synthetic missed/rejected).
 */

export type TripTimeSlice = {
  startedAt: Date;
  endedAt: Date | null;
};

export type DriverDayMetricsValues = {
  hoursOnline: number;
  rejections: number;
  missed: number;
};

/** Hours connected and offer counts from completed trip timestamps only. */
export function computeDayMetricsFromTripSlices(trips: TripTimeSlice[]): DriverDayMetricsValues {
  if (trips.length === 0) {
    return { hoursOnline: 0, rejections: 0, missed: 0 };
  }

  let sumMinutes = 0;
  let minStart = Number.POSITIVE_INFINITY;
  let maxEnd = Number.NEGATIVE_INFINITY;

  for (const t of trips) {
    const startMs = t.startedAt.getTime();
    const endMs = (t.endedAt ?? t.startedAt).getTime();
    sumMinutes += Math.max(1, Math.round((endMs - startMs) / 60_000));
    minStart = Math.min(minStart, startMs);
    maxEnd = Math.max(maxEnd, endMs);
  }

  const spanMinutes = Math.max(0, Math.round((maxEnd - minStart) / 60_000));
  const activeMinutes = Math.max(sumMinutes, spanMinutes);

  return {
    hoursOnline: activeMinutes / 60,
    rejections: 0,
    missed: 0,
  };
}
