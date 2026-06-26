import type { AnalyticsRow } from "@/features/analytics/lib/analitica-mock-data";
import { RidePlatform } from "@prisma/client";

export type AnalyticsPlatformFilter = "total" | "uber" | "freenow" | "bolt" | "cabify";

const FILTER_TO_RIDE: Record<Exclude<AnalyticsPlatformFilter, "total">, RidePlatform> = {
  uber: RidePlatform.UBER,
  freenow: RidePlatform.FREENOW,
  bolt: RidePlatform.BOLT,
  cabify: RidePlatform.CABIFY,
};

export function parseAnalyticsPlatformFilter(
  raw: string | undefined,
): AnalyticsPlatformFilter {
  if (raw === "uber" || raw === "freenow" || raw === "bolt" || raw === "cabify") {
    return raw;
  }
  return "total";
}

export function analyticsPlatformLabel(filter: AnalyticsPlatformFilter): string {
  if (filter === "total") return "Total";
  if (filter === "uber") return "Uber";
  if (filter === "freenow") return "FreeNow";
  if (filter === "bolt") return "Bolt";
  return "Cabify";
}

export function matchesAnalyticsPlatform(
  row: Pick<AnalyticsRow, "platform" | "platforms">,
  filter: AnalyticsPlatformFilter,
): boolean {
  if (filter === "total") return true;
  const ride = FILTER_TO_RIDE[filter];
  if (row.platforms?.includes(ride)) return true;
  const slug = `${filter}-only`;
  if (row.platform === slug) return true;
  if (row.platform === "both") {
    return filter === "uber" || filter === "freenow";
  }
  return false;
}

export function ridePlatformForAnalyticsFilter(
  filter: AnalyticsPlatformFilter,
): RidePlatform | undefined {
  if (filter === "total") return undefined;
  return FILTER_TO_RIDE[filter];
}

export function analyticsPlatformKpiMultiplier(filter: AnalyticsPlatformFilter): number {
  if (filter === "total") return 1;
  if (filter === "uber") return 0.58;
  if (filter === "freenow") return 0.48;
  if (filter === "bolt") return 0.22;
  return 0.18;
}
