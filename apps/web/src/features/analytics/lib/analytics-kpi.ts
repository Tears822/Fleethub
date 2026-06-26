import { formatEuro, formatEurHour } from "@/features/analytics/lib/analitica-format";
import type { AnalyticsKpi } from "@/features/analytics/lib/analytics-types";
import type { SectorDriverAverages } from "@fleethub/auth/analytics-sector-types";

export type { SectorDriverAverages } from "@fleethub/auth/analytics-sector-types";

export type AnalyticsMetrics = {
  facturacion: number;
  comisiones: number;
  eurHora: number;
  neto: number;
};

export function netoFromMetrics(m: Pick<AnalyticsMetrics, "facturacion" | "comisiones">): number {
  return m.facturacion + m.comisiones;
}

function pctVsSector(current: number, sector: number): number {
  if (sector === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - sector) / Math.abs(sector)) * 100);
}

function formatSectorEuro(amount: number): string {
  return formatEuro(amount);
}

function buildVsSectorLine(
  current: number,
  sector: number,
  formatValue: (n: number) => string,
  higherIsBetter: boolean,
): { line: string; positive: boolean } {
  const pct = pctVsSector(current, sector);
  const sign = pct > 0 ? "+" : "";
  const better =
    higherIsBetter ? current >= sector : current >= sector;
  return {
    line: `${sign}${pct}% vs sector (${formatValue(sector)})`,
    positive: better,
  };
}

export function buildAnalyticsKpis(
  current: AnalyticsMetrics,
  sector: AnalyticsMetrics,
): AnalyticsKpi[] {
  const factVs = buildVsSectorLine(
    current.facturacion,
    sector.facturacion,
    formatSectorEuro,
    true,
  );
  const comPct =
    sector.comisiones === 0
      ? 0
      : Math.round(
          ((Math.abs(current.comisiones) - Math.abs(sector.comisiones)) /
            Math.abs(sector.comisiones)) *
            100,
        );
  const comWorse = Math.abs(current.comisiones) > Math.abs(sector.comisiones);
  const comVs = {
    line: `${comPct > 0 ? "+" : ""}${comPct}% vs sector (${formatSectorEuro(sector.comisiones)})`,
    positive: !comWorse,
  };
  const eurVs = buildVsSectorLine(
    current.eurHora,
    sector.eurHora,
    (n) =>
      n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    true,
  );
  const netVs = buildVsSectorLine(current.neto, sector.neto, formatSectorEuro, true);

  return [
    {
      label: "Facturación total",
      value: formatSectorEuro(current.facturacion),
      vsSector: factVs.line,
      vsSectorPositive: factVs.positive,
    },
    {
      label: "Comisiones totales",
      value: formatSectorEuro(current.comisiones),
      vsSector: comVs.line,
      vsSectorPositive: comVs.positive,
      danger: true,
    },
    {
      label: "€/hora media",
      value: current.eurHora.toLocaleString("es-ES", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      vsSector: eurVs.line,
      vsSectorPositive: eurVs.positive,
    },
    {
      label: "Neto ingresado",
      value: formatSectorEuro(current.neto),
      vsSector: netVs.line,
      vsSectorPositive: netVs.positive,
    },
  ];
}

export function formatSectorDelta(
  value: number,
  sectorAvg: number,
  format: (n: number) => string,
): string {
  if (sectorAvg === 0 && value === 0) return "sector: —";
  const diff = value - sectorAvg;
  const sign = diff > 0 ? "+" : "";
  return `sector: ${sign}${format(diff)}`;
}

/** Valores absolutos de la media sector (fila gris en spec). */
export function sectorDriverAveragesToDisplayCells(
  sector: SectorDriverAverages,
): string[] {
  return [
    formatEuro(sector.facturacion),
    formatEuro(sector.comisiones),
    String(sector.viajes),
    String(sector.turnos),
    formatEuro(sector.mediaTurno),
    formatEurHour(sector.eurHora),
    formatEuro(sector.propinas),
    formatEuro(sector.primas),
  ];
}

export type AnalyticsEstado = "ok" | "medio" | "alerta";

export type AnalyticsEstadoMetrics = {
  facturacion: number;
  viajes: number;
  eurHora: number;
};

/** ≥ media sector en facturación, viajes y €/hora; 2–3 → ok, 1 → medio, 0 → alerta. */
export function analyticsEstadoFromSector(
  driver: AnalyticsEstadoMetrics,
  sector: AnalyticsEstadoMetrics,
): AnalyticsEstado {
  const noSector =
    sector.facturacion === 0 && sector.viajes === 0 && sector.eurHora === 0;
  if (noSector) return "medio";

  let met = 0;
  if (driver.facturacion >= sector.facturacion) met += 1;
  if (driver.viajes >= sector.viajes) met += 1;
  if (driver.eurHora >= sector.eurHora) met += 1;

  if (met >= 2) return "ok";
  if (met === 1) return "medio";
  return "alerta";
}

export function averageDriverMetrics(
  rows: AnalyticsEstadoMetrics[],
): AnalyticsEstadoMetrics {
  if (rows.length === 0) {
    return { facturacion: 0, viajes: 0, eurHora: 0 };
  }
  const n = rows.length;
  return {
    facturacion: Math.round(
      rows.reduce((s, r) => s + r.facturacion, 0) / n,
    ),
    viajes: Math.round(rows.reduce((s, r) => s + r.viajes, 0) / n),
    eurHora: Math.round((rows.reduce((s, r) => s + r.eurHora, 0) / n) * 10) / 10,
  };
}
