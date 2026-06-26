import type { DriverDayMetrics } from "@fleethub/contracts";
import { uberFleetPost } from "./uber-fleet-client.js";

function utcDayOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function dayBoundsUtc(day: Date): { startsAt: number; endsAt: number } {
  const start = utcDayOnly(day);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { startsAt: start.getTime(), endsAt: end.getTime() };
}

type AnalyticsBody = {
  reportResults?: Array<{
    reports?: Array<{
      rows?: Array<{
        dimensionValues?: Array<{ value?: string; name?: string }>;
        metricValues?: Array<{ value?: number | string; name?: string }>;
      }>;
    }>;
  }>;
  reports?: Array<{
    rows?: Array<{
      dimensionValues?: Array<{ value?: string }>;
      metricValues?: Array<{ value?: number | string }>;
    }>;
  }>;
};

function collectRows(body: AnalyticsBody): Array<{
  dimensionValues?: Array<{ value?: string; name?: string }>;
  metricValues?: Array<{ value?: number | string; name?: string }>;
}> {
  const rows: Array<{
    dimensionValues?: Array<{ value?: string; name?: string }>;
    metricValues?: Array<{ value?: number | string; name?: string }>;
  }> = [];
  for (const rr of body.reportResults ?? []) {
    for (const report of rr.reports ?? []) {
      rows.push(...(report.rows ?? []));
    }
  }
  for (const report of body.reports ?? []) {
    rows.push(...(report.rows ?? []));
  }
  return rows;
}

function metricNumber(
  values: Array<{ value?: number | string; name?: string }> | undefined,
  index: number,
): number {
  const raw = values?.[index]?.value;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function rowDriverId(row: {
  dimensionValues?: Array<{ value?: string; name?: string }>;
}): string | null {
  for (const d of row.dimensionValues ?? []) {
    const v = d.value?.trim();
    if (!v) continue;
    if (!d.name || d.name.includes("driver") || d.name.includes("Driver")) {
      return v;
    }
  }
  const first = row.dimensionValues?.[0]?.value?.trim();
  return first && first.length > 0 ? first : null;
}

/**
 * Uber Supplier Performance — vs:HoursOnline (+ optional vs:TotalTrips) for one driver/day.
 * @see https://developer.uber.com/docs/vehicles/references/api/v1/supplier-performance-data/get-performance-data
 */
export async function fetchUberDriverDayMetrics(params: {
  orgId: string;
  driverUuid: string;
  day: Date;
}): Promise<DriverDayMetrics | null> {
  const { startsAt, endsAt } = dayBoundsUtc(params.day);
  const driverUuid = params.driverUuid.trim();

  const res = await uberFleetPost<AnalyticsBody>("/v1/vehicle-suppliers/analytics-data/query", {
    orgId: { orgUuid: params.orgId },
    reportRequests: [
      {
        timeRanges: [{ startsAt, endsAt }],
        dimensions: [{ name: "vs:driver" }],
        metrics: [{ expression: "vs:HoursOnline" }, { expression: "vs:TotalTrips" }],
      },
    ],
  });

  if (!res.ok) {
    console.warn("[uber] analytics:", res.message);
    return null;
  }

  const rows = collectRows(res.data);
  const match =
    rows.find((r) => rowDriverId(r) === driverUuid) ??
    (rows.length === 1 ? rows[0] : undefined);

  if (!match) {
    return null;
  }

  const hoursOnline = metricNumber(match.metricValues, 0);

  return {
    hoursOnline: hoursOnline > 0 ? hoursOnline : 0,
    rejections: 0,
    missed: 0,
  };
}
