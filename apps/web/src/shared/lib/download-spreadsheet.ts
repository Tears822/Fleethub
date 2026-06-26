import ExcelJS from "exceljs";

/** Format a number for CSV opened in Spanish Excel (`;` separator, `,` decimal). */
export function formatCsvNumber(value: number, decimals = 2): string {
  if (decimals === 0 && Number.isInteger(value)) return String(value);
  return value.toFixed(decimals).replace(".", ",");
}

function escapeCsvField(value: string): string {
  if (/[;"\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function csvNumberDecimals(value: number): number {
  if (Number.isInteger(value)) return 0;
  if (Math.abs(Math.round(value * 10) - value * 10) < 1e-9) return 1;
  return 2;
}

function csvCell(value: string | number): string {
  if (typeof value === "number") return formatCsvNumber(value, csvNumberDecimals(value));
  return escapeCsvField(value);
}

function normalizeXlsxFilename(filename: string): string {
  if (filename.endsWith(".xlsx")) return filename;
  if (filename.endsWith(".xls")) return `${filename.slice(0, -4)}.xlsx`;
  return `${filename}.xlsx`;
}

function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[\\/*?:[\]]/g, " ").trim();
  return (cleaned || "Datos").slice(0, 31);
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Downloads tabular data as UTF-8 CSV (`;` separator). Numeric columns use comma decimals for Excel (es-ES).
 */
export function downloadCsvTable(options: {
  filename: string;
  headers: string[];
  rows: (string | number)[][];
}): void {
  const { filename, headers, rows } = options;
  const sep = ";";
  const lines = [
    headers.map(escapeCsvField).join(sep),
    ...rows.map((row) => row.map(csvCell).join(sep)),
  ];
  const blob = new Blob(["\uFEFF", lines.join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  triggerBlobDownload(blob, filename.endsWith(".csv") ? filename : `${filename}.csv`);
}

/**
 * Downloads a real `.xlsx` workbook (Office Open XML). Avoids Excel warnings from fake `.xls` XML files.
 */
export async function downloadExcelTable(options: {
  filename: string;
  sheetName?: string;
  headers: string[];
  rows: (string | number)[][];
}): Promise<void> {
  const { filename, sheetName = "Datos", headers, rows } = options;
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(sanitizeSheetName(sheetName));

  const headerRow = sheet.addRow(headers);
  headerRow.font = { bold: true };

  for (const row of rows) {
    sheet.addRow(row.map((cell) => (typeof cell === "number" ? cell : String(cell))));
  }

  sheet.columns.forEach((column) => {
    let max = 10;
    column.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? "").length;
      if (len > max) max = Math.min(len + 2, 48);
    });
    column.width = max;
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  triggerBlobDownload(blob, normalizeXlsxFilename(filename));
}
