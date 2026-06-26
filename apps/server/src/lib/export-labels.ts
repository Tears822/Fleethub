import type { AppsProductivityLabel } from "@fleethub/auth";
import { RidePlatform } from "@fleethub/db";
import type { Translator } from "@fleethub/i18n";

export function exportPlatformLabel(platform: RidePlatform): string {
  if (platform === RidePlatform.FREENOW) return "FreeNow";
  if (platform === RidePlatform.BOLT) return "Bolt";
  if (platform === RidePlatform.CABIFY) return "Cabify";
  return "Uber";
}

export function exportPlatformLabels(platforms: RidePlatform[]): string {
  const order = [RidePlatform.UBER, RidePlatform.FREENOW, RidePlatform.BOLT, RidePlatform.CABIFY];
  const set = new Set(platforms);
  return order.filter((p) => set.has(p)).map(exportPlatformLabel).join(", ");
}

export function translateScopeLabel(t: Translator, label: string): string {
  if (label === "Todas las empresas") return t("billing.allCompanies");
  if (label === "Sin empresas") return t("exports.scope.noCompanies");
  return label;
}

export function shiftExportHeaders(t: Translator, withDate: boolean): string[] {
  return [
    ...(withDate ? [t("exports.columns.date")] : []),
    t("exports.columns.company"),
    t("turnos.columns.platforms"),
    t("turnos.columns.conductor"),
    t("turnos.columns.viajes"),
    t("turnos.columns.total"),
    t("turnos.columns.t3"),
    t("turnos.columns.app"),
    t("turnos.columns.efectivo"),
    t("turnos.columns.tarjetas"),
    t("turnos.columns.propinas"),
    t("turnos.columns.primas"),
    t("turnos.columns.peajes"),
    t("turnos.columns.avisos"),
  ];
}

export function setShiftHeaderWidths(
  sheet: import("exceljs").Worksheet,
  headers: string[],
  withDate: boolean,
): void {
  const companyIdx = withDate ? 1 : 0;
  const conductorIdx = withDate ? 3 : 2;
  headers.forEach((_, index) => {
    const col = sheet.getColumn(index + 1);
    if (withDate && index === 0) col.width = 12;
    else if (index === companyIdx) col.width = 24;
    else if (index === conductorIdx) col.width = 28;
    else col.width = 14;
  });
}

export function productivityExportLabel(t: Translator, label: AppsProductivityLabel): string {
  if (label === "Óptimo") return t("apps.optimal");
  if (label === "Medio") return t("apps.medium");
  return t("apps.low");
}

export function syncStatusExportLabel(t: Translator, status: string): string {
  const s = status.trim().toUpperCase();
  if (s === "SUCCESS") return t("sync.statusOk");
  if (s === "PARTIAL") return t("sync.statusPartial");
  if (s === "FAILED") return t("sync.statusFailed");
  if (s === "RUNNING") return t("sync.statusRunning");
  if (s === "SKIPPED") return t("sync.statusSkipped");
  return status;
}

export function paymentPdfLabel(t: Translator, method: string | null): string {
  if (!method) return "—";
  const m = method.toLowerCase();
  if (m.includes("cash") || m.includes("efectivo")) return t("exports.pdf.paymentCash");
  if (m.includes("card") || m.includes("tarjeta")) return t("exports.pdf.paymentCard");
  if (m.includes("app")) return t("exports.pdf.paymentApp");
  return method;
}
