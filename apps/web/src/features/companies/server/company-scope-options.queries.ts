import "server-only";

import type { CompanyScope } from "@/features/auth/server/company-scope";
import { tenantCompanyWhere } from "@fleethub/auth/tenant-scope";
import { withTenant } from "@/infrastructure/database";

export type CompanyScopeOption = {
  id: string;
  label: string;
};

/** Companies visible in the shell header filter (current tenant + user scope only). */
export async function listCompanyScopeOptions(
  tenantId: string,
  scope: CompanyScope,
): Promise<CompanyScopeOption[]> {
  const rows = await withTenant(tenantId, (tx) =>
    tx.company.findMany({
      where: { ...tenantCompanyWhere(tenantId, scope), isActive: true },
      orderBy: { legalName: "asc" },
      select: { id: true, legalName: true },
    }),
  );

  return rows.map((c) => ({ id: c.id, label: c.legalName }));
}
