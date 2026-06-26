/** FRD §14.3 — FleetHub_{tipo}_{rango}_generado{YYYYMMDD}.ext */
export function buildExportFilename(
  reportType: string,
  extension: "csv" | "xlsx" | "pdf" | "zip",
  rangeLabel = "actual",
): string {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const safeType = reportType.replace(/[^\w-]+/g, "_");
  const safeRange = rangeLabel.replace(/[^\w-]+/g, "_");
  return `FleetHub_${safeType}_${safeRange}_generado${today}.${extension}`;
}
