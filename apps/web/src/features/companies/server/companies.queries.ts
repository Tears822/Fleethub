import "server-only";

import { listCompanyDocuments } from "@fleethub/auth";
import type { CompanyScope } from "@/features/auth/server/company-scope";
import { driverWhere, tenantCompanyWhere } from "@/features/auth/server/company-scope";
import {
  formatListAddress,
  parseCompanyProfile,
  platformLabels,
  type CompanyDocumentView,
  type CompanyProfile,
} from "@/features/companies/lib/company-profile";
import { withTenant } from "@/infrastructure/database";
import { RidePlatform } from "@prisma/client";

function currentMonthBounds(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function formatBillingMonth(cents: bigint): string {
  if (cents <= BigInt(0)) return "0 €";
  const euros = Number(cents) / 100;
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(euros);
}

export type CompanyListRow = {
  id: string;
  legalName: string;
  taxId: string | null;
  logoUrl: string | null;
  isActive: boolean;
  profile: CompanyProfile;
  listAddress: string;
  contactName: string;
  email: string;
  billingMonth: string;
  platforms: string[];
  licensedDrivers: number | null;
  activeDrivers: number;
  _count: { drivers: number };
};

export type CompanyDetailRow = CompanyListRow & {
  documents: CompanyDocumentView[];
};

async function loadCompanyAggregates(
  tenantId: string,
  scope: CompanyScope,
  companyIds: string[],
): Promise<{
  billingByCompany: Map<string, bigint>;
  platformsByCompany: Map<string, Set<RidePlatform>>;
}> {
  const billingByCompany = new Map<string, bigint>();
  const platformsByCompany = new Map<string, Set<RidePlatform>>();

  if (companyIds.length === 0) {
    return { billingByCompany, platformsByCompany };
  }

  const { start } = currentMonthBounds();

  const [trips, accounts] = await withTenant(tenantId, (tx) =>
    Promise.all([
      tx.trip.findMany({
        where: {
          tenantId,
          liquidationStatus: "closed",
          startedAt: { gte: start },
          driver: { ...driverWhere(scope), companyId: { in: companyIds } },
        },
        select: {
          netAmountCents: true,
          driver: { select: { companyId: true } },
        },
      }),
      tx.driverPlatformAccount.findMany({
        where: {
          tenantId,
          isActive: true,
          driver: { companyId: { in: companyIds }, ...driverWhere(scope) },
        },
        select: {
          platform: true,
          driver: { select: { companyId: true } },
        },
      }),
    ]),
  );

  for (const trip of trips) {
    const cid = trip.driver.companyId;
    const prev = billingByCompany.get(cid) ?? BigInt(0);
    billingByCompany.set(cid, prev + (trip.netAmountCents ?? BigInt(0)));
  }

  for (const acc of accounts) {
    let set = platformsByCompany.get(acc.driver.companyId);
    if (!set) {
      set = new Set();
      platformsByCompany.set(acc.driver.companyId, set);
    }
    set.add(acc.platform);
  }

  return { billingByCompany, platformsByCompany };
}

async function loadActiveDriverCountsByCompany(
  tenantId: string,
  scope: CompanyScope,
  companyIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (companyIds.length === 0) return counts;

  const rows = await withTenant(tenantId, (tx) =>
    tx.driver.groupBy({
      by: ["companyId"],
      where: {
        tenantId,
        companyId: { in: companyIds },
        isActive: true,
        ...driverWhere(scope),
      },
      _count: { _all: true },
    }),
  );

  for (const row of rows) {
    counts.set(row.companyId, row._count._all);
  }
  return counts;
}

function mapCompanyRow(
  company: {
    id: string;
    legalName: string;
    taxId: string | null;
    logoUrl: string | null;
    isActive: boolean;
    profile: unknown;
    _count: { drivers: number };
  },
  billingByCompany: Map<string, bigint>,
  platformsByCompany: Map<string, Set<RidePlatform>>,
  activeDriversByCompany: Map<string, number>,
): CompanyListRow {
  const profile = parseCompanyProfile(company.profile);
  const platforms = platformLabels(
    [...(platformsByCompany.get(company.id) ?? new Set())].sort(),
  );

  return {
    id: company.id,
    legalName: company.legalName,
    taxId: company.taxId,
    logoUrl: company.logoUrl,
    isActive: company.isActive,
    profile,
    listAddress: formatListAddress(profile),
    contactName: profile.contactName.trim() || "—",
    email: profile.email.trim() || "—",
    billingMonth: formatBillingMonth(billingByCompany.get(company.id) ?? BigInt(0)),
    platforms,
    licensedDrivers: profile.licensedDrivers,
    activeDrivers: activeDriversByCompany.get(company.id) ?? 0,
    _count: company._count,
  };
}

export async function listCompaniesForTenant(
  tenantId: string,
  scope: CompanyScope,
): Promise<CompanyListRow[]> {
  const companies = await withTenant(tenantId, (tx) =>
    tx.company.findMany({
      where: tenantCompanyWhere(tenantId, scope),
      orderBy: { legalName: "asc" },
      include: { _count: { select: { drivers: true } } },
    }),
  );

  const ids = companies.map((c) => c.id);
  const [{ billingByCompany, platformsByCompany }, activeDriversByCompany] = await Promise.all([
    loadCompanyAggregates(tenantId, scope, ids),
    loadActiveDriverCountsByCompany(tenantId, scope, ids),
  ]);

  return companies.map((c) =>
    mapCompanyRow(c, billingByCompany, platformsByCompany, activeDriversByCompany),
  );
}

export async function getCompanyById(
  tenantId: string,
  companyId: string,
  scope: CompanyScope,
): Promise<CompanyDetailRow | null> {
  const company = await withTenant(tenantId, (tx) =>
    tx.company.findFirst({
      where: { id: companyId, ...tenantCompanyWhere(tenantId, scope) },
      include: { _count: { select: { drivers: true } } },
    }),
  );
  if (!company) return null;

  const [{ billingByCompany, platformsByCompany }, activeDriversByCompany] = await Promise.all([
    loadCompanyAggregates(tenantId, scope, [company.id]),
    loadActiveDriverCountsByCompany(tenantId, scope, [company.id]),
  ]);

  const row = mapCompanyRow(
    company,
    billingByCompany,
    platformsByCompany,
    activeDriversByCompany,
  );
  return {
    ...row,
    documents: listCompanyDocuments(company.profile) as CompanyDocumentView[],
  };
}
