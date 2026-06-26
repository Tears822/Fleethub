import ExcelJS from "exceljs";
import { ingestSourceLabel, parseSyncRunCursorHint } from "@fleethub/auth";
import { formatDateTimeShortInTenantTz } from "@fleethub/auth/display-timezone";
import type { AppSession } from "@fleethub/auth";
import { withTenant } from "@fleethub/db";
import { syncStatusExportLabel } from "./export-labels.js";
import { getExportTranslator } from "./export-translator.js";

const SYNC_HISTORY_DAYS = 30;

export async function buildSyncHistoryXlsx(session: AppSession): Promise<Buffer> {
  if (session.kind !== "tenant" || !session.tid) {
    throw new Error("No autorizado.");
  }

  const t = await getExportTranslator(session);

  const since = new Date();
  since.setDate(since.getDate() - SYNC_HISTORY_DAYS);

  const rows = await withTenant(session.tid, (tx) =>
    tx.syncRun.findMany({
      where: { tenantId: session.tid!, startedAt: { gte: since } },
      orderBy: { startedAt: "desc" },
      take: 200,
      select: {
        platform: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        errorMessage: true,
        cursorHint: true,
      },
    }),
  );

  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(t("exports.sheets.syncHistory"));
  sheet.columns = [
    { header: t("exports.meta.platform"), key: "platform", width: 12 },
    { header: t("exports.columns.ingestion"), key: "ingesta", width: 16 },
    { header: t("turnos.columns.viajes"), key: "viajes", width: 10 },
    { header: t("exports.columns.collisions"), key: "colisiones", width: 12 },
    { header: t("exports.columns.status"), key: "estado", width: 12 },
    { header: t("exports.columns.start"), key: "inicio", width: 18 },
    { header: t("exports.columns.end"), key: "fin", width: 18 },
    { header: t("exports.columns.detail"), key: "detalle", width: 48 },
  ];

  for (const row of rows) {
    const hint = parseSyncRunCursorHint(row.cursorHint);
    sheet.addRow({
      platform: row.platform,
      ingesta: ingestSourceLabel(hint.ingestSource),
      viajes: hint.tripsUpserted ?? "",
      colisiones: hint.ingestCollisions ?? "",
      estado: syncStatusExportLabel(t, row.status),
      inicio: formatDateTimeShortInTenantTz(row.startedAt),
      fin: row.finishedAt ? formatDateTimeShortInTenantTz(row.finishedAt) : "",
      detalle: row.errorMessage ?? "",
    });
  }

  sheet.getRow(1).font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
