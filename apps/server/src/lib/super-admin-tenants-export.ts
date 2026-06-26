import ExcelJS from "exceljs";
import {
  billingPlanFromTenantSettings,
  commercialStatusLabel,
  readCompanyProfileForSuperAdminForm,
} from "@fleethub/auth";
import { prisma } from "@fleethub/db";

function formatAlta(d: Date): string {
  return d.toLocaleDateString("es-ES");
}

function platformsLabel(hasUber: boolean, hasFreeNow: boolean): string {
  if (hasUber && hasFreeNow) return "Uber, FreeNow";
  if (hasUber) return "Uber";
  if (hasFreeNow) return "FreeNow";
  return "";
}

export async function buildSuperAdminTenantsXlsx(): Promise<Buffer> {
  const rows = await prisma.tenant.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      companies: {
        orderBy: { createdAt: "asc" },
        select: { legalName: true, taxId: true, isActive: true, profile: true },
      },
      users: {
        take: 1,
        orderBy: { createdAt: "asc" },
        select: { email: true },
      },
      driverPlatformAccounts: {
        where: { isActive: true, platform: { in: ["UBER", "FREENOW"] } },
        select: { platform: true },
        distinct: ["platform"],
      },
      _count: { select: { users: true, drivers: true } },
    },
  });

  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Tenants");
  sheet.columns = [
    { header: "Operador", key: "name", width: 22 },
    { header: "Slug", key: "slug", width: 18 },
    { header: "CIF", key: "taxId", width: 14 },
    { header: "Empresa", key: "company", width: 32 },
    { header: "Plataformas", key: "platforms", width: 16 },
    { header: "Uber", key: "uber", width: 8 },
    { header: "FreeNow", key: "freenow", width: 10 },
    { header: "Email contacto (1ª empresa)", key: "email", width: 28 },
    { header: "Email acceso admin", key: "adminEmail", width: 28 },
    { header: "Persona contacto", key: "contactPerson", width: 22 },
    { header: "Teléfono contacto", key: "contactPhone", width: 16 },
    { header: "Teléfono empresa", key: "phone", width: 16 },
    { header: "Plan", key: "plan", width: 12 },
    { header: "Estado", key: "status", width: 12 },
    { header: "Alta", key: "alta", width: 12 },
    { header: "Usuarios", key: "users", width: 10 },
    { header: "Conductores", key: "drivers", width: 12 },
  ];

  for (const t of rows) {
    const company = t.companies[0];
    const profile = readCompanyProfileForSuperAdminForm(company?.profile);
    const profileEmail = profile.email.trim();
    const platformSet = new Set(t.driverPlatformAccounts.map((a) => a.platform));
    const hasUber = platformSet.has("UBER");
    const hasFreeNow = platformSet.has("FREENOW");
    const companyLines =
      t.companies.length > 0
        ? t.companies
        : [{ legalName: "", taxId: null as string | null, isActive: true, profile: null }];

    const shared = {
      name: t.name,
      slug: t.slug,
      platforms: platformsLabel(hasUber, hasFreeNow),
      uber: hasUber ? "Sí" : "No",
      freenow: hasFreeNow ? "Sí" : "No",
      email: profileEmail,
      adminEmail: t.users[0]?.email ?? "",
      contactPerson: profile.contactPerson,
      contactPhone: profile.contactPhone || profile.phone,
      phone: profile.phone,
      plan: billingPlanFromTenantSettings(t.settings),
      status: commercialStatusLabel(t.commercialStatus),
      alta: formatAlta(t.createdAt),
      users: t._count.users,
      drivers: t._count.drivers,
    };

    for (const co of companyLines) {
      sheet.addRow({
        ...shared,
        taxId: co.taxId ?? "",
        company: co.legalName,
      });
    }
  }

  sheet.getRow(1).font = { bold: true };
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
