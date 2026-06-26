import ExcelJS from "exceljs";
import type { AppSession } from "@fleethub/auth";
import { resolveDriverEconomics } from "@fleethub/auth";
import { tenantDriverWhere, resolveCompanyScopeForSession } from "@fleethub/auth/tenant-scope";
import { withTenant } from "@fleethub/db";
import { exportPlatformLabels } from "./export-labels.js";
import { getExportTranslator } from "./export-translator.js";

function empresaSharePct(driverPct: number | null | undefined): number | "" {
  if (driverPct == null || !Number.isFinite(driverPct)) return "";
  return Math.max(0, Math.min(100, 100 - Math.round(driverPct)));
}

export async function buildDriversXlsx(session: AppSession): Promise<Buffer> {
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

  const drivers = await withTenant(tenantId, (tx) =>
    tx.driver.findMany({
      where: {
        ...tenantDriverWhere(tenantId, scope),
        company: { tenantId, isActive: true },
      },
      orderBy: { fullName: "asc" },
      include: {
        company: { select: { legalName: true, profile: true } },
        driverPlatformAccounts: {
          where: { isActive: true },
          select: { platform: true },
        },
      },
    }),
  );

  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(t("exports.sheets.drivers"));
  sheet.columns = [
    { header: t("exports.columns.name"), key: "nombre", width: 28 },
    { header: t("exports.columns.dni"), key: "dni", width: 14 },
    { header: t("exports.columns.company"), key: "empresa", width: 32 },
    { header: t("exports.columns.status"), key: "estado", width: 12 },
    { header: t("turnos.columns.platforms"), key: "plataformas", width: 18 },
    { header: t("exports.columns.license"), key: "licencia", width: 16 },
    { header: t("exports.columns.phone"), key: "telefono", width: 16 },
    { header: t("common.email"), key: "email", width: 28 },
    { header: t("exports.columns.driverShare"), key: "recaudacionConductor", width: 18 },
    { header: t("exports.columns.companyShare"), key: "recaudacionEmpresa", width: 18 },
    { header: t("exports.columns.bonusDriverShare"), key: "primasConductor", width: 16 },
    { header: t("exports.columns.bonusCompanyShare"), key: "primasEmpresa", width: 16 },
    { header: t("exports.columns.feeDriverShare"), key: "comisionConductor", width: 22 },
    { header: t("exports.columns.feeCompanyShare"), key: "comisionEmpresa", width: 22 },
  ];

  for (const d of drivers) {
    const economics = resolveDriverEconomics(d, d.company.profile);
    sheet.addRow({
      nombre: d.fullName,
      dni: d.dni?.trim() ?? "",
      empresa: d.company.legalName,
      estado: d.isActive ? t("exports.status.activeM") : t("exports.status.inactiveM"),
      plataformas: exportPlatformLabels(d.driverPlatformAccounts.map((a) => a.platform)),
      licencia: d.licenseNumber ?? "",
      telefono: d.phone ?? "",
      email: d.email ?? "",
      recaudacionConductor: economics.driverSharePct,
      recaudacionEmpresa: empresaSharePct(economics.driverSharePct),
      primasConductor: economics.driverBonusSharePct,
      primasEmpresa: empresaSharePct(economics.driverBonusSharePct),
      comisionConductor: economics.driverPlatformFeeSharePct,
      comisionEmpresa: empresaSharePct(economics.driverPlatformFeeSharePct),
    });
  }

  sheet.getRow(1).font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
