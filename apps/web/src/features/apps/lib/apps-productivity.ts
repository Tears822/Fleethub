import type { AppsUsageRow } from "@/features/apps/lib/apps-usage-types";
import {
  APPS_PRODUCTIVITY_STATUS_LABEL,
  appsProductivityStatus,
  classifyAppsProductivity,
  computeFleetDayAveragesFromMetrics,
  type FleetDayAverages,
} from "@fleethub/auth/apps-productivity";

export type { FleetDayAverages };

export function classifyProductivity(
  eurH: number,
  acceptancePct: number,
  thresholds: Parameters<typeof classifyAppsProductivity>[2],
  fleet: FleetDayAverages | null,
): AppsUsageRow["productividad"] {
  return classifyAppsProductivity(eurH, acceptancePct, thresholds, fleet);
}

export function statusFromProductivity(p: AppsUsageRow["productividad"]): AppsUsageRow["status"] {
  return appsProductivityStatus(p);
}

export const PRODUCTIVITY_STATUS_LABEL = APPS_PRODUCTIVITY_STATUS_LABEL;

export function computeFleetDayAverages(rows: AppsUsageRow[]): FleetDayAverages | null {
  return computeFleetDayAveragesFromMetrics(rows);
}
