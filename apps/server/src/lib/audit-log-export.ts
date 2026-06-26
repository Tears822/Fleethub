import ExcelJS from "exceljs";
import { AUDIT_LOG_EXPORT_MAX, listTenantAuditLogs } from "@fleethub/auth";
import type { AppSession } from "@fleethub/auth";
import { getExportTranslator } from "./export-translator.js";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export async function buildAuditLogXlsx(session: AppSession): Promise<Buffer> {
  const t = await getExportTranslator(session);
  const result = await listTenantAuditLogs(session, AUDIT_LOG_EXPORT_MAX);
  if (!result.ok) {
    throw new Error(result.error.message);
  }

  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(t("exports.sheets.auditLog"));
  sheet.columns = [
    { header: t("exports.columns.date"), key: "fecha", width: 18 },
    { header: t("exports.columns.action"), key: "accion", width: 28 },
    { header: t("exports.columns.user"), key: "usuario", width: 24 },
    { header: t("common.email"), key: "email", width: 28 },
    { header: t("exports.columns.detail"), key: "detalle", width: 40 },
    { header: t("exports.columns.entityType"), key: "entityType", width: 14 },
    { header: t("exports.columns.entityId"), key: "entityId", width: 36 },
  ];

  for (const row of result.value) {
    sheet.addRow({
      fecha: formatWhen(row.createdAt),
      accion: row.actionLabel,
      usuario: row.actorName,
      email: row.actorEmail ?? "",
      detalle: row.detail ?? row.entityType ?? "",
      entityType: row.entityType ?? "",
      entityId: row.entityId ?? "",
    });
  }

  sheet.getRow(1).font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
