import ExcelJS from "exceljs";
import {
  COMPANY_DOCUMENT_CATALOG,
  COMPANY_DOCUMENT_IDS,
  listCompanyDocuments,
  readCompanyProfileForSuperAdminForm,
} from "@fleethub/auth";
import type { CompanyDocumentId } from "@fleethub/auth";
import { prisma, type RidePlatform } from "@fleethub/db";

function formatAlta(d: Date): string {
  return d.toLocaleDateString("es-ES");
}

function licensedDriversLabel(profile: unknown): string {
  if (!profile || typeof profile !== "object") return "Sin cupo";
  const v = (profile as Record<string, unknown>).licensedDrivers;
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return String(Math.floor(v));
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", "."));
    if (Number.isFinite(n) && n >= 0) return String(Math.floor(n));
  }
  return "Sin cupo";
}

function sepaNoteFromProfile(profile: unknown): string {
  if (!profile || typeof profile !== "object") return "";
  const v = (profile as Record<string, unknown>).sepaNote;
  return typeof v === "string" ? v.trim() : "";
}

function licenseUsageText(activeDrivers: number, profile: unknown): string {
  const label = licensedDriversLabel(profile);
  if (label === "Sin cupo") return `${activeDrivers} / Sin cupo`;
  const cap = Number(label);
  return `${activeDrivers} / ${cap}`;
}

const PLATFORM_LABELS: Record<string, string> = {
  UBER: "Uber",
  FREENOW: "FreeNow",
  BOLT: "Bolt",
  CABIFY: "Cabify",
};

function platformsLabel(platforms: Set<RidePlatform>): string {
  if (platforms.size === 0) return "";
  return [...platforms]
    .sort()
    .map((p) => PLATFORM_LABELS[p] ?? p)
    .join(", ");
}

function documentStatus(profile: unknown, docId: CompanyDocumentId): string {
  const docs = listCompanyDocuments(profile);
  const doc = docs.find((d) => d.id === docId);
  if (!doc) return "Pendiente";
  const parts = [doc.statusLabel];
  if (doc.fileName) parts.push(doc.fileName);
  return parts.join(" — ");
}

export async function buildSuperAdminCompaniesXlsx(): Promise<Buffer> {
  const rows = await prisma.company.findMany({
    orderBy: [{ tenant: { name: "asc" } }, { legalName: "asc" }],
    include: {
      tenant: { select: { name: true, slug: true } },
      _count: { select: { drivers: true } },
    },
  });

  const companyIds = rows.map((c) => c.id);

  const activeByCompany = new Map<string, number>();
  const platformsByCompany = new Map<string, Set<RidePlatform>>();

  if (companyIds.length > 0) {
    const [activeGroups, platformAccounts] = await Promise.all([
      prisma.driver.groupBy({
        by: ["companyId"],
        where: { companyId: { in: companyIds }, isActive: true },
        _count: { _all: true },
      }),
      prisma.driverPlatformAccount.findMany({
        where: {
          isActive: true,
          platform: { in: ["UBER", "FREENOW", "BOLT", "CABIFY"] },
          driver: { companyId: { in: companyIds } },
        },
        select: {
          platform: true,
          driver: { select: { companyId: true } },
        },
      }),
    ]);

    for (const g of activeGroups) {
      activeByCompany.set(g.companyId, g._count._all);
    }
    for (const acc of platformAccounts) {
      const cid = acc.driver.companyId;
      let set = platformsByCompany.get(cid);
      if (!set) {
        set = new Set();
        platformsByCompany.set(cid, set);
      }
      set.add(acc.platform);
    }
  }

  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Empresas");
  sheet.columns = [
    { header: "ID empresa", key: "id", width: 38 },
    { header: "Razón social", key: "legalName", width: 32 },
    { header: "CIF", key: "taxId", width: 14 },
    { header: "Operador", key: "tenantName", width: 22 },
    { header: "Slug operador", key: "tenantSlug", width: 18 },
    { header: "Dirección", key: "address", width: 28 },
    { header: "C.P.", key: "postalCode", width: 10 },
    { header: "Población", key: "city", width: 16 },
    { header: "Provincia", key: "province", width: 14 },
    { header: "País", key: "country", width: 12 },
    { header: "Licencias contratadas", key: "licensedDrivers", width: 18 },
    { header: "Conductores (total)", key: "driversTotal", width: 16 },
    { header: "Conductores activos", key: "driversActive", width: 16 },
    { header: "Uso licencias", key: "licenseUsage", width: 14 },
    { header: "Plataformas", key: "platforms", width: 18 },
    { header: "Empresa activa", key: "active", width: 12 },
    { header: "Logo", key: "logo", width: 8 },
    { header: "Persona contacto", key: "contactPerson", width: 22 },
    { header: "Teléfono empresa", key: "phone", width: 16 },
    { header: "Teléfono contacto", key: "contactPhone", width: 16 },
    { header: "Email", key: "email", width: 28 },
    { header: "IBAN", key: "iban", width: 28 },
    { header: "Nota SEPA", key: "sepaNote", width: 24 },
    {
      header: COMPANY_DOCUMENT_CATALOG.nda.title,
      key: "docNda",
      width: 22,
    },
    {
      header: COMPANY_DOCUMENT_CATALOG.auth.title,
      key: "docAuth",
      width: 22,
    },
    {
      header: COMPANY_DOCUMENT_CATALOG.sepa.title,
      key: "docSepa",
      width: 18,
    },
    { header: "Alta", key: "alta", width: 12 },
  ];

  for (const c of rows) {
    const profile = readCompanyProfileForSuperAdminForm(c.profile);
    const activeDrivers = activeByCompany.get(c.id) ?? 0;
    const platforms = platformsByCompany.get(c.id) ?? new Set<RidePlatform>();

    sheet.addRow({
      id: c.id,
      legalName: c.legalName,
      taxId: c.taxId ?? "",
      tenantName: c.tenant.name,
      tenantSlug: c.tenant.slug,
      address: profile.address,
      postalCode: profile.postalCode,
      city: profile.city,
      province: profile.province,
      country: profile.country,
      licensedDrivers: licensedDriversLabel(c.profile),
      driversTotal: c._count.drivers,
      driversActive: activeDrivers,
      licenseUsage: licenseUsageText(activeDrivers, c.profile),
      platforms: platformsLabel(platforms),
      active: c.isActive ? "Sí" : "No",
      logo: c.logoUrl ? "Sí" : "No",
      contactPerson: profile.contactPerson,
      phone: profile.phone,
      contactPhone: profile.contactPhone,
      email: profile.email.trim(),
      iban: profile.iban,
      sepaNote: sepaNoteFromProfile(c.profile),
      docNda: documentStatus(c.profile, COMPANY_DOCUMENT_IDS[0]),
      docAuth: documentStatus(c.profile, COMPANY_DOCUMENT_IDS[1]),
      docSepa: documentStatus(c.profile, COMPANY_DOCUMENT_IDS[2]),
      alta: formatAlta(c.createdAt),
    });
  }

  sheet.getRow(1).font = { bold: true };
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
