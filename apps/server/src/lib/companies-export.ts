import ExcelJS from "exceljs";
import type { AppSession } from "@fleethub/auth";
import {
  driverWhere,
  resolveCompanyScopeForSession,
  tenantCompanyWhere,
  type CompanyScope,
} from "@fleethub/auth/tenant-scope";
import { RidePlatform, withTenant } from "@fleethub/db";
import { getExportTranslator } from "./export-translator.js";

function profileField(profile: unknown, key: string): string {
  if (!profile || typeof profile !== "object") return "";
  const v = (profile as Record<string, unknown>)[key];
  return typeof v === "string" ? v : "";
}

function profileNumber(profile: unknown, key: string): number | null {
  if (!profile || typeof profile !== "object") return null;
  const v = (profile as Record<string, unknown>)[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function platformLabel(p: RidePlatform): string {
  if (p === RidePlatform.FREENOW) return "FreeNow";
  if (p === RidePlatform.BOLT) return "Bolt";
  if (p === RidePlatform.CABIFY) return "Cabify";
  return "Uber";
}

function currentMonthStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

async function loadCompanyExportAggregates(
  tenantId: string,
  scope: CompanyScope,
  companyIds: string[],
): Promise<{
  billingCentsByCompany: Map<string, bigint>;
  platformsByCompany: Map<string, string[]>;
  activeDriversByCompany: Map<string, number>;
}> {
  const billingCentsByCompany = new Map<string, bigint>();
  const platformsByCompany = new Map<string, string[]>();
  const activeDriversByCompany = new Map<string, number>();

  if (companyIds.length === 0) {
    return { billingCentsByCompany, platformsByCompany, activeDriversByCompany };
  }

  const monthStart = currentMonthStart();

  const [trips, accounts, driverCounts] = await withTenant(tenantId, (tx) =>
    Promise.all([
      tx.trip.findMany({
        where: {
          tenantId,
          liquidationStatus: "closed",
          startedAt: { gte: monthStart },
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
    ]),
  );

  for (const trip of trips) {
    const cid = trip.driver.companyId;
    const prev = billingCentsByCompany.get(cid) ?? BigInt(0);
    billingCentsByCompany.set(cid, prev + (trip.netAmountCents ?? BigInt(0)));
  }

  const platformSets = new Map<string, Set<RidePlatform>>();
  for (const acc of accounts) {
    let set = platformSets.get(acc.driver.companyId);
    if (!set) {
      set = new Set();
      platformSets.set(acc.driver.companyId, set);
    }
    set.add(acc.platform);
  }
  for (const [cid, set] of platformSets.entries()) {
    platformsByCompany.set(
      cid,
      [...set].sort().map((p) => platformLabel(p)),
    );
  }

  for (const row of driverCounts) {
    activeDriversByCompany.set(row.companyId, row._count._all);
  }

  return { billingCentsByCompany, platformsByCompany, activeDriversByCompany };
}

export async function buildCompaniesXlsx(session: AppSession): Promise<Buffer> {
  if (session.kind !== "tenant" || !session.tid) {
    throw new Error("No autorizado.");
  }

  const t = await getExportTranslator(session);
  const tenantId = session.tid;
  const scope = await resolveCompanyScopeForSession({
    ...session,
    kind: "tenant",
    tid: tenantId,
  });

  const companies = await withTenant(tenantId, (tx) =>
    tx.company.findMany({
      where: tenantCompanyWhere(tenantId, scope),
      orderBy: { legalName: "asc" },
      include: { _count: { select: { drivers: true } } },
    }),
  );

  const ids = companies.map((c) => c.id);
  const { billingCentsByCompany, platformsByCompany, activeDriversByCompany } =
    await loadCompanyExportAggregates(tenantId, scope, ids);

  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(t("exports.sheets.companies"));
  sheet.columns = [
    { header: t("exports.columns.legalName"), key: "razonSocial", width: 32 },
    { header: t("exports.columns.taxId"), key: "nif", width: 14 },
    { header: t("exports.columns.contact"), key: "contacto", width: 24 },
    { header: t("common.email"), key: "email", width: 28 },
    { header: t("exports.columns.licenses"), key: "licencias", width: 12 },
    { header: t("exports.columns.drivers"), key: "conductores", width: 12 },
    { header: t("exports.columns.billingMonth"), key: "facturacionMes", width: 18 },
    { header: t("turnos.columns.platforms"), key: "plataformas", width: 22 },
    { header: t("exports.columns.status"), key: "estado", width: 12 },
  ];

  for (const c of companies) {
    const licensed = profileNumber(c.profile, "licensedDrivers");
    const billingCents = billingCentsByCompany.get(c.id) ?? BigInt(0);
    sheet.addRow({
      razonSocial: c.legalName,
      nif: c.taxId ?? "",
      contacto: profileField(c.profile, "contactName"),
      email: profileField(c.profile, "email"),
      licencias: licensed ?? "",
      conductores: activeDriversByCompany.get(c.id) ?? 0,
      facturacionMes: Number(billingCents) / 100,
      plataformas: (platformsByCompany.get(c.id) ?? []).join(", "),
      estado: c.isActive ? t("exports.status.activeF") : t("exports.status.inactiveF"),
    });
  }

  sheet.getRow(1).font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
