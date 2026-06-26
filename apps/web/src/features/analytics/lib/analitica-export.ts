import type { AnalyticsRow } from "@/features/analytics/lib/analitica-mock-data";
import {
  sectorDriverAveragesToDisplayCells,
  type SectorDriverAverages,
} from "@/features/analytics/lib/analytics-kpi";
import { rowToDisplayCells } from "@/features/analytics/lib/analitica-format";
import { downloadExcelTable } from "@/shared/lib/download-spreadsheet";

const HEADERS = [
  "Conductor",
  "Facturación",
  "Comisiones",
  "Viajes",
  "Turnos",
  "Media / turno",
  "€/hora",
  "Propinas",
  "Primas",
  "Estado",
] as const;

const SECTOR_ROW_LABEL = "Media sector";

function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Filas para Excel: conductor + opcional fila «Media sector» debajo. */
export function buildAnaliticaExportRows(
  rows: AnalyticsRow[],
  sectorAverages: SectorDriverAverages | null,
): string[][] {
  const out: string[][] = [];
  for (const row of rows) {
    out.push([row.conductor, ...rowToDisplayCells(row), row.estado]);
    if (sectorAverages) {
      out.push([SECTOR_ROW_LABEL, ...sectorDriverAveragesToDisplayCells(sectorAverages), ""]);
    }
  }
  return out;
}

export async function exportAnaliticaToExcel(
  rows: AnalyticsRow[],
  options: {
    platform: string;
    from: string;
    to: string;
    sectorAverages?: SectorDriverAverages | null;
  },
  formatRow?: (row: AnalyticsRow) => string[],
): Promise<void> {
  const tableRows =
    options.sectorAverages != null
      ? buildAnaliticaExportRows(rows, options.sectorAverages)
      : rows.map((row) =>
          formatRow ? formatRow(row) : [row.conductor, ...rowToDisplayCells(row), row.estado],
        );

  await downloadExcelTable({
    filename: `analitica-${options.platform.toLowerCase()}-${todayStamp()}.xlsx`,
    sheetName: "Analítica",
    headers: [...HEADERS],
    rows: tableRows,
  });
}
