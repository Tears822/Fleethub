import { withTenant } from "@fleethub/db";
import type { AppSession } from "./types";
import {
  companyWhere,
  driverWhere,
  resolveCompanyScopeForSession,
  type CompanyScope,
} from "./tenant-scope";

export const FH_COMPANY_SCOPE_COOKIE = "fleethub_company_scope";
export const COMPANY_SCOPE_ALL = "all";

/** Cookie value: `<tenantId>:<companyId|all>` — prevents cross-tenant scope bleed. */
export function formatCompanyScopeCookie(tenantId: string, selection: string): string {
  return `${tenantId}:${selection}`;
}

/**
 * Parse shell company-scope cookie for the active tenant.
 * Legacy values without `tenantId:` prefix are accepted only when they match a company id
 * in the caller's allowed list (handled in resolveCompanyScopeWithCookie).
 */
export function parseCompanyScopeCookieSelection(
  raw: string | null | undefined,
  tenantId: string,
): string {
  if (!raw) return COMPANY_SCOPE_ALL;
  const decoded = decodeURIComponent(raw).trim();
  if (!decoded) return COMPANY_SCOPE_ALL;

  const colon = decoded.indexOf(":");
  if (colon > 0) {
    const cookieTenantId = decoded.slice(0, colon);
    const selection = decoded.slice(colon + 1);
    if (cookieTenantId !== tenantId) return COMPANY_SCOPE_ALL;
    return selection || COMPANY_SCOPE_ALL;
  }

  // Legacy cookie (company id or "all" without tenant prefix)
  return decoded;
}

function parseCookieHeader(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("=") || "") || null;
  }
  return null;
}

type ResolveCompanyScopeWithCookieOptions = {
  cookieHeader?: string;
  cookieValue?: string;
};

/**
 * Effective company scope: user RBAC scope + shell company selector cookie.
 * Used by Cerrar turnos table, detalle API, exports, and shift mutations.
 */
export async function resolveCompanyScopeWithCookie(
  session: AppSession & { kind: "tenant"; tid: string },
  options?: ResolveCompanyScopeWithCookieOptions,
): Promise<CompanyScope> {
  const base = await resolveCompanyScopeForSession(session);

  const companies = await withTenant(session.tid, (tx) =>
    tx.company.findMany({
      where: { tenantId: session.tid, ...companyWhere(base), isActive: true },
      select: { id: true },
      orderBy: { legalName: "asc" },
    }),
  );

  if (companies.length === 1) {
    return { mode: "restricted", companyIds: [companies[0]!.id] };
  }

  if (companies.length === 0) {
    return base.mode === "restricted" ? base : { mode: "restricted", companyIds: [] };
  }

  if (base.mode === "restricted" && base.companyIds.length === 1) {
    return base;
  }

  const raw =
    options?.cookieValue ??
    parseCookieHeader(options?.cookieHeader, FH_COMPANY_SCOPE_COOKIE);
  const selected = parseCompanyScopeCookieSelection(raw, session.tid);

  if (!selected || selected === COMPANY_SCOPE_ALL) {
    return base;
  }

  if (companies.some((c) => c.id === selected)) {
    return { mode: "restricted", companyIds: [selected] };
  }

  return base;
}

/** Label for export headers / page subtitles. */
export async function companyScopeLabelForSession(
  session: AppSession & { kind: "tenant"; tid: string },
  options?: ResolveCompanyScopeWithCookieOptions,
): Promise<string> {
  const scope = await resolveCompanyScopeWithCookie(session, options);

  const companies = await withTenant(session.tid, (tx) =>
    tx.company.findMany({
      where: { tenantId: session.tid, ...companyWhere(scope) },
      select: { id: true, legalName: true },
      orderBy: { legalName: "asc" },
    }),
  );

  if (companies.length === 0) return "Sin empresas";
  if (companies.length === 1) return companies[0]!.legalName;
  if (scope.mode === "restricted" && scope.companyIds.length === 1) {
    const match = companies.find((c) => c.id === scope.companyIds[0]);
    if (match) return match.legalName;
  }
  return "Todas las empresas";
}

/** Verify a driver id belongs to the tenant and optional company scope. */
export function driverIdMatchesScope(
  driver: { companyId: string },
  scope: CompanyScope,
): boolean {
  const filter = driverWhere(scope);
  const companyIds = (filter as { companyId?: { in: string[] } }).companyId?.in;
  if (!companyIds) return true;
  return companyIds.includes(driver.companyId);
}
