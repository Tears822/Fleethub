import "server-only";

import type { CompanyScope } from "@/features/auth/server/company-scope";
import { driverWhere, tenantCompanyWhere } from "@/features/auth/server/company-scope";
import { withTenant } from "@/infrastructure/database";

export async function loadDashboardCounts(tenantId: string, scope: CompanyScope) {
  return withTenant(tenantId, (tx) =>
    Promise.all([
      tx.driver.count({ where: driverWhere(scope) }),
      tx.company.count({ where: tenantCompanyWhere(tenantId, scope) }),
      scope.mode === "all" ? tx.user.count() : Promise.resolve(null),
    ]),
  );
}
