import "server-only";

import { resolveCompanyScopeForSession } from "@fleethub/auth/tenant-scope";
import type { CompanyScope } from "@/features/auth/server/company-scope";
import { readCompanyScopeCookieSelection } from "@/features/auth/server/company-scope";
import { listCompanyScopeOptions } from "@/features/companies/server/company-scope-options.queries";
import {
  COMPANY_SCOPE_ALL,
} from "@/features/shell/lib/company-scope-cookie";
import type { TenantSession } from "@/features/auth/server/session.service";

/** Etiqueta para export y cabeceras según selector de empresa del shell. */
export async function billingCompanyScopeLabel(
  session: TenantSession,
  scope: CompanyScope,
): Promise<string> {
  const base = await resolveCompanyScopeForSession(session);
  const companies = await listCompanyScopeOptions(session.tid, base);

  if (companies.length === 0) return "Sin empresas";
  if (companies.length === 1) return companies[0]!.label;

  if (scope.mode === "restricted" && scope.companyIds.length === 1) {
    const match = companies.find((c) => c.id === scope.companyIds[0]);
    if (match) return match.label;
  }

  const selected = await readCompanyScopeCookieSelection(session);
  if (!selected || selected === COMPANY_SCOPE_ALL) {
    return "Todas las empresas";
  }

  const match = companies.find((c) => c.id === selected);
  return match?.label ?? "Todas las empresas";
}
