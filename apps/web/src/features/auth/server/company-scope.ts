import "server-only";

import { cookies } from "next/headers";
import {
  FH_COMPANY_SCOPE_COOKIE,
  parseCompanyScopeCookieSelection,
  resolveCompanyScopeWithCookie,
  companyScopeLabelForSession,
  COMPANY_SCOPE_ALL,
} from "@fleethub/auth/company-scope-cookie";
import type { CompanyScope } from "@fleethub/auth/tenant-scope";
import { listCompanyScopeOptions } from "@/features/companies/server/company-scope-options.queries";
import type { TenantSession } from "@/features/auth/server/session.service";
import { getSessionTranslator } from "@/shared/i18n/tenant-translator.server";

export type { CompanyScope };
export { COMPANY_SCOPE_ALL, FH_COMPANY_SCOPE_COOKIE };

/** Etiqueta de empresa(s) activas en el shell (para subtítulos operativos). */
export async function resolveCompanyScopeLabel(session: TenantSession): Promise<string> {
  const { t } = await getSessionTranslator(session);
  const jar = await cookies();
  const raw = jar.get(FH_COMPANY_SCOPE_COOKIE)?.value;
  const label = await companyScopeLabelForSession(session, { cookieValue: raw });
  if (label === "Todas las empresas") return t("billing.allCompanies");
  if (label === "Sin empresas") return t("common.noCompanies");
  return label;
}

export async function resolveCompanyScope(session: TenantSession): Promise<CompanyScope> {
  const jar = await cookies();
  const raw = jar.get(FH_COMPANY_SCOPE_COOKIE)?.value;
  return resolveCompanyScopeWithCookie(session, { cookieValue: raw });
}

export async function readCompanyScopeCookieSelection(session: TenantSession): Promise<string> {
  const jar = await cookies();
  const raw = jar.get(FH_COMPANY_SCOPE_COOKIE)?.value;
  return parseCompanyScopeCookieSelection(raw, session.tid);
}

export {
  companyWhere,
  driverWhere,
  tenantCompanyWhere,
  tenantDriverWhere,
} from "@fleethub/auth/tenant-scope";

export function canAccessCompany(scope: CompanyScope, companyId: string): boolean {
  if (scope.mode === "all") return true;
  return scope.companyIds.includes(companyId);
}
