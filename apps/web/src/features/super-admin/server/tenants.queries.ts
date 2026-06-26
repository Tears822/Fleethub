import "server-only";

import {
  billingPlanFromTenantSettings,
  commercialStatusLabel,
  readCompanyProfileForSuperAdminForm,
  superAdminTenantToFormSnapshot,
} from "@fleethub/auth";
import type { TenantCommercialStatus } from "@fleethub/db";
import type { SuperAdminTenantFormValues } from "@/features/super-admin/lib/super-admin-tenant-form-data";
import { formatTenantCompaniesLabel } from "@/features/super-admin/lib/format-tenant-companies";
import { withoutTenant } from "@/infrastructure/database";

export type SuperAdminTenantCompanyLine = {
  legalName: string;
  taxId: string | null;
};

export type SuperAdminTenantRow = {
  id: string;
  name: string;
  slug: string;
  companies: SuperAdminTenantCompanyLine[];
  companyNames: string[];
  companiesLabel: string;
  companyName: string | null;
  taxId: string | null;
  hasUber: boolean;
  hasFreeNow: boolean;
  /** Email in company profile (first company). */
  contactEmail: string | null;
  /** First tenant admin login email — shown when profile has no contact email. */
  adminLoginEmail: string | null;
  contactPerson: string;
  contactPhone: string;
  userCount: number;
  driverCount: number;
  createdAt: Date;
  plan: string;
  commercialStatus: TenantCommercialStatus;
  status: string;
  trialEndsAt: Date | null;
};

function mapTenant(row: {
  id: string;
  name: string;
  slug: string;
  commercialStatus: TenantCommercialStatus;
  trialEndsAt: Date | null;
  createdAt: Date;
  settings: unknown;
  companies: {
    legalName: string;
    taxId: string | null;
    isActive: boolean;
    profile: unknown;
  }[];
  users: { email: string }[];
  driverPlatformAccounts: { platform: "UBER" | "FREENOW" | "BOLT" | "CABIFY" }[];
  _count: { users: number; drivers: number };
}): SuperAdminTenantRow {
  const company = row.companies[0];
  const adminUser = row.users[0];
  const profile = readCompanyProfileForSuperAdminForm(company?.profile);
  const companies = row.companies.map((c) => ({
    legalName: c.legalName,
    taxId: c.taxId,
  }));
  const companyNames = row.companies.map((c) => c.legalName);
  const profileEmail = profile.email.trim() || null;
  const adminLoginEmail = adminUser?.email?.trim() || null;
  const platformSet = new Set(row.driverPlatformAccounts.map((a) => a.platform));

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    companies,
    companyNames,
    companiesLabel: formatTenantCompaniesLabel(companyNames),
    hasUber: platformSet.has("UBER"),
    hasFreeNow: platformSet.has("FREENOW"),
    companyName: company?.legalName ?? null,
    taxId: company?.taxId ?? null,
    contactEmail: profileEmail,
    adminLoginEmail,
    contactPerson: profile.contactPerson,
    contactPhone: profile.contactPhone || profile.phone,
    userCount: row._count.users,
    driverCount: row._count.drivers,
    createdAt: row.createdAt,
    plan: billingPlanFromTenantSettings(row.settings),
    commercialStatus: row.commercialStatus,
    status: commercialStatusLabel(row.commercialStatus),
    trialEndsAt: row.trialEndsAt,
  };
}

/** Global tenant list — requires DB role that bypasses RLS (owner / BYPASSRLS). */
export async function listAllTenantsForSuperAdmin(): Promise<SuperAdminTenantRow[]> {
  const rows = await withoutTenant((db) =>
    db.tenant.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        companies: {
          where: { isActive: true },
          orderBy: { createdAt: "asc" },
          select: { legalName: true, taxId: true, isActive: true, profile: true },
        },
        users: {
          take: 1,
          orderBy: { createdAt: "asc" },
          where: { role: "ADMIN_TENANT" },
          select: { email: true },
        },
        driverPlatformAccounts: {
          where: { isActive: true, platform: { in: ["UBER", "FREENOW"] } },
          select: { platform: true },
          distinct: ["platform"],
        },
        _count: { select: { users: true, drivers: true } },
      },
    }),
  );
  return rows.map(mapTenant);
}

const tenantInclude = {
  companies: {
    take: 1,
    orderBy: { createdAt: "asc" as const },
    select: { legalName: true, taxId: true, isActive: true, profile: true },
  },
  users: {
    take: 1,
    orderBy: { createdAt: "asc" as const },
    where: { role: "ADMIN_TENANT" as const },
    select: { email: true },
  },
  _count: { select: { users: true, drivers: true } },
};

export type SuperAdminTenantCompanyRow = {
  id: string;
  legalName: string;
  taxId: string | null;
  isActive: boolean;
};

export async function listTenantCompaniesForSuperAdmin(
  tenantId: string,
  options?: { includeInactive?: boolean },
): Promise<SuperAdminTenantCompanyRow[]> {
  const rows = await withoutTenant((db) =>
    db.company.findMany({
      where: {
        tenantId,
        ...(options?.includeInactive ? {} : { isActive: true }),
      },
      orderBy: { legalName: "asc" },
      select: { id: true, legalName: true, taxId: true, isActive: true },
    }),
  );
  return rows;
}

export async function getTenantByIdForSuperAdmin(
  id: string,
): Promise<SuperAdminTenantFormValues | null> {
  const row = await withoutTenant((db) =>
    db.tenant.findUnique({
      where: { id },
      include: tenantInclude,
    }),
  );
  if (!row) return null;

  const company = row.companies[0];
  return superAdminTenantToFormSnapshot({
    id: row.id,
    name: row.name,
    slug: row.slug,
    commercialStatus: row.commercialStatus,
    trialEndsAt: row.trialEndsAt,
    settings: row.settings,
    company: company
      ? {
          taxId: company.taxId,
          isActive: company.isActive,
          profile: company.profile,
        }
      : null,
    contactEmail: row.users[0]?.email ?? null,
  });
}

export type SuperAdminPlatformStats = {
  tenantTotal: number;
  tenantActive: number;
  tenantUserTotal: number;
  tenantUserActive: number;
  platformUserTotal: number;
  platformUserActive: number;
  driverTotal: number;
  driversUber: number;
  driversFreeNow: number;
};

export async function loadSuperAdminPlatformStats(): Promise<SuperAdminPlatformStats> {
  const [
    tenantTotal,
    tenantActive,
    tenantUserTotal,
    tenantUserActive,
    platformUserTotal,
    platformUserActive,
    driverTotal,
    uberAccounts,
    freeNowAccounts,
  ] = await withoutTenant((db) =>
    Promise.all([
      db.tenant.count(),
      db.tenant.count({
        where: { commercialStatus: "ACTIVE" },
      }),
      db.user.count(),
      db.user.count({ where: { isActive: true } }),
      db.platformUser.count(),
      db.platformUser.count({ where: { isActive: true } }),
      db.driver.count(),
      db.driverPlatformAccount.findMany({
        where: { platform: "UBER", isActive: true },
        select: { driverId: true },
        distinct: ["driverId"],
      }),
      db.driverPlatformAccount.findMany({
        where: { platform: "FREENOW", isActive: true },
        select: { driverId: true },
        distinct: ["driverId"],
      }),
    ]),
  );

  return {
    tenantTotal,
    tenantActive,
    tenantUserTotal,
    tenantUserActive,
    platformUserTotal,
    platformUserActive,
    driverTotal,
    driversUber: uberAccounts.length,
    driversFreeNow: freeNowAccounts.length,
  };
}
