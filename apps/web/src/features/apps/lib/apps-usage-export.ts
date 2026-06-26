import { appsPlatformDisplayName } from "@/features/apps/lib/apps-platform";
import type { AppsUsageRow } from "@/features/apps/lib/apps-usage-types";
import { resolveEurPerHourFromLabel } from "@fleethub/auth/eur-per-hour";
import { downloadExcelTable } from "@/shared/lib/download-spreadsheet";

const HEADERS = [
  "Plataforma",
  "Conductor",
  "Empresa",
  "Viajes",
  "Facturación (€)",
  "Horas",
  "€/hora",
  "T. aceptación (%)",
  "Productividad",
] as const;

function todayStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildExportRows(rows: AppsUsageRow[]): (string | number)[][] {
  const data = rows.map((r) => [
    appsPlatformDisplayName(r.platform),
    r.conductor,
    r.empresa,
    r.viajes,
    Math.round(r.facturacionEur * 100) / 100,
    Math.round(r.horasDecimal * 10) / 10,
    Math.round(resolveEurPerHourFromLabel(r.facturacionEur, r.horas) * 100) / 100,
    r.aceptacionPct,
    r.productividad,
  ]);

  if (rows.length === 0) return data;

  const totalViajes = rows.reduce((sum, r) => sum + r.viajes, 0);
  const totalFacturacion = rows.reduce((sum, r) => sum + r.facturacionEur, 0);
  const totalHoras = rows.reduce((sum, r) => sum + r.horasDecimal, 0);
  const totalEurH =
    totalHoras >= 0.25
      ? Math.round((totalFacturacion / totalHoras) * 10) / 10
      : 0;

  data.push([
    "TOTAL",
    "",
    "",
    totalViajes,
    Math.round(totalFacturacion * 100) / 100,
    Math.round(totalHoras * 10) / 10,
    totalEurH,
    "",
    "",
  ]);

  return data;
}

export async function exportAppsUsageToExcel(
  platform: "all" | string,
  rows: AppsUsageRow[],
): Promise<void> {
  if (platform === "all") {
    await downloadExcelTable({
      filename: `uso-app-todas-plataformas-${todayStamp()}.xlsx`,
      sheetName: "Uso app todas",
      headers: [...HEADERS],
      rows: buildExportRows(rows),
    });
    return;
  }

  const platformLabelText = appsPlatformDisplayName(platform);
  const safeSlug = platform.replace(/[^\w-]+/g, "-");
  await downloadExcelTable({
    filename: `uso-app-${safeSlug}-${todayStamp()}.xlsx`,
    sheetName: `Uso app ${platformLabelText}`.slice(0, 31),
    headers: [...HEADERS],
    rows: buildExportRows(rows),
  });
}
