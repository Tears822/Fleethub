import "server-only";

import {
  listCompanyDocumentsForMaintenance,
  readCompanyProfileForSuperAdminForm,
} from "@fleethub/auth";
import type { CompanyDocumentMaintenanceView } from "@/features/companies/lib/company-profile";
import {
  parseCompanyProfile,
  type CompanyProfile,
} from "@/features/companies/lib/company-profile";
import { withoutTenant } from "@/infrastructure/database";

export type SuperAdminCompanyRow = {
  id: string;
  legalName: string;
  taxId: string | null;
  isActive: boolean;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  contactEmail: string | null;
  driverCount: number;
  createdAt: Date;
};

export async function listAllCompaniesForSuperAdmin(): Promise<SuperAdminCompanyRow[]> {
  const rows = await withoutTenant((db) =>
    db.company.findMany({
      orderBy: [{ tenant: { name: "asc" } }, { legalName: "asc" }],
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
        _count: { select: { drivers: true } },
      },
    }),
  );

  return rows.map((c) => {
    const profile = readCompanyProfileForSuperAdminForm(c.profile);
    return {
      id: c.id,
      legalName: c.legalName,
      taxId: c.taxId,
      isActive: c.isActive,
      tenantId: c.tenantId,
      tenantName: c.tenant.name,
      tenantSlug: c.tenant.slug,
      contactEmail: profile.email.trim() || null,
      driverCount: c._count.drivers,
      createdAt: c.createdAt,
    };
  });
}

export type SuperAdminTenantOption = {
  id: string;
  name: string;
  slug: string;
};

export async function getCompanyByIdForSuperAdmin(
  companyId: string,
): Promise<
  (EmpresaFormInitial & {
    tenantId: string;
    tenantName: string;
    tenantSlug: string;
    driverCount: number;
    documentsMaintenance: CompanyDocumentMaintenanceView[];
  }) | null
> {
  const row = await withoutTenant((db) =>
    db.company.findUnique({
      where: { id: companyId },
      include: {
        tenant: { select: { name: true, slug: true } },
        _count: { select: { drivers: true } },
      },
    }),
  );
  if (!row) return null;

  return {
    id: row.id,
    legalName: row.legalName,
    taxId: row.taxId,
    logoUrl: row.logoUrl,
    isActive: row.isActive,
    profile: parseCompanyProfile(row.profile),
    documentsMaintenance: listCompanyDocumentsForMaintenance(
      row.profile,
      row.id,
    ) as CompanyDocumentMaintenanceView[],
    tenantId: row.tenantId,
    tenantName: row.tenant.name,
    tenantSlug: row.tenant.slug,
    driverCount: row._count.drivers,
  };
}

export type EmpresaFormInitial = {
  id: string;
  legalName: string;
  taxId: string | null;
  logoUrl: string | null;
  isActive: boolean;
  profile: CompanyProfile;
};

export async function listTenantOptionsForSuperAdmin(): Promise<SuperAdminTenantOption[]> {
  return withoutTenant((db) =>
    db.tenant.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    }),
  );
}
