import { TenantRole, withTenant } from "@fleethub/db";
import type { AppSession } from "./types";

export type CompanyScope =
  | { mode: "all" }
  | { mode: "restricted"; companyIds: string[] };

export async function resolveCompanyScopeForSession(
  session: AppSession & { kind: "tenant"; tid: string },
): Promise<CompanyScope> {
  /** Super Admin impersonation uses platform sub — no user_companies rows. */
  if (session.impersonating) {
    return { mode: "all" };
  }

  if (session.role === TenantRole.ADMIN_TENANT) {
    return { mode: "all" };
  }

  const links = await withTenant(session.tid, (tx) =>
    tx.userCompany.findMany({
      where: { userId: session.sub },
      select: { companyId: true },
    }),
  );

  return { mode: "restricted", companyIds: links.map((l) => l.companyId) };
}

export function companyWhere(scope: CompanyScope) {
  if (scope.mode === "all") return {};
  if (scope.companyIds.length === 0) return { id: { in: [] } };
  return { id: { in: scope.companyIds } };
}

/** Defense in depth when DB role bypasses RLS (superuser): always scope by tenant. */
export function tenantCompanyWhere(tenantId: string, scope: CompanyScope) {
  return { tenantId, ...companyWhere(scope) };
}

export function driverWhere(scope: CompanyScope) {
  if (scope.mode === "all") return {};
  if (scope.companyIds.length === 0) return { companyId: { in: [] } };
  return { companyId: { in: scope.companyIds } };
}

/** Defense in depth when DB role bypasses RLS (superuser): always scope by tenant. */
export function tenantDriverWhere(tenantId: string, scope: CompanyScope) {
  return { tenantId, ...driverWhere(scope) };
}

/** Trip queries: tenant row + optional company scope on driver. */
export function tenantTripWhere(tenantId: string, scope: CompanyScope) {
  const driverFilter = driverWhere(scope);
  return Object.keys(driverFilter).length > 0
    ? { tenantId, driver: driverFilter }
    : { tenantId };
}
