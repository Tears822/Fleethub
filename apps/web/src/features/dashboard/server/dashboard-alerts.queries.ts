import "server-only";

import type { CompanyScope } from "@/features/auth/server/company-scope";
import { driverWhere } from "@/features/auth/server/company-scope";
import {
  buildOperationalAlertsForTenant,
  getTenantProductivityThresholds,
  mapOperationalAlertsToDashboard,
  type DashboardStyleAlert,
} from "@fleethub/auth";

export type DashboardAlertItem = DashboardStyleAlert;

export async function loadDashboardAlerts(
  tenantId: string,
  scope: CompanyScope,
  thresholds?: Awaited<ReturnType<typeof getTenantProductivityThresholds>>,
): Promise<DashboardAlertItem[]> {
  const productivity = thresholds ?? (await getTenantProductivityThresholds(tenantId));
  const lines = await buildOperationalAlertsForTenant(tenantId, {
    tripDriverWhere: driverWhere(scope),
  });
  return mapOperationalAlertsToDashboard(lines, productivity);
}
