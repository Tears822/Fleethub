import type { AnalyticsMetrics, SectorDriverAverages } from "@/features/analytics/lib/analytics-kpi";

export type { AnalyticsMetrics, SectorDriverAverages };

export type AnalyticsKpi = {
  label: string;
  value: string;
  /** Comparativa media del resto de operadores (tenants) en FleetHub. */
  vsSector: string;
  vsSectorPositive?: boolean;
  danger?: boolean;
};

export type SectorDriverAveragesByPlatform = {
  total: SectorDriverAverages;
  uber: SectorDriverAverages;
  freenow: SectorDriverAverages;
  bolt: SectorDriverAverages;
  cabify: SectorDriverAverages;
};

export type AnalyticsSectorByPlatform = {
  total: AnalyticsMetrics;
  uber: AnalyticsMetrics;
  freenow: AnalyticsMetrics;
  bolt: AnalyticsMetrics;
  cabify: AnalyticsMetrics;
  driverAverages: SectorDriverAveragesByPlatform;
};
